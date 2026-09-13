import csv
import io
import json
import logging

from celery import shared_task
from django.contrib.gis.geos import GEOSGeometry
from django.db import transaction

logger = logging.getLogger(__name__)


@shared_task
def ingest_geojson(dataset_id, geojson_text, user_id=None):
    from apps.accounts.models import User
    from apps.layers.models import Dataset, Feature

    dataset = Dataset.objects.get(pk=dataset_id)
    user = User.objects.filter(pk=user_id).first() if user_id else None
    payload = json.loads(geojson_text)
    features = payload.get("features", [])
    created = 0

    with transaction.atomic():
        for feat in features:
            geom_data = feat.get("geometry")
            geom = None
            if geom_data:
                geom = GEOSGeometry(json.dumps(geom_data), srid=4326)
                if geom.srid != 4326:
                    geom.transform(4326)
            Feature.objects.create(
                dataset=dataset,
                geom=geom,
                props=feat.get("properties") or {},
                created_by=user,
            )
            created += 1

    logger.info("Ingested %d features into dataset %d", created, dataset_id)
    return {"dataset": dataset_id, "created": created}


@shared_task
def ingest_csv(dataset_id, csv_text, geom_column="geometry", user_id=None):
    from apps.accounts.models import User
    from apps.layers.models import Dataset, Feature

    dataset = Dataset.objects.get(pk=dataset_id)
    user = User.objects.filter(pk=user_id).first() if user_id else None
    created = 0

    reader = csv.DictReader(io.StringIO(csv_text))
    with transaction.atomic():
        for row in reader:
            props = dict(row)
            geom_data = props.pop(geom_column, None)
            geom = None
            if geom_data:
                geom = GEOSGeometry(geom_data, srid=4326)
                if geom.srid != 4326:
                    geom.transform(4326)
            Feature.objects.create(dataset=dataset, geom=geom, props=props, created_by=user)
            created += 1

    logger.info("Ingested %d rows from CSV into dataset %d", created, dataset_id)
    return {"dataset": dataset_id, "created": created}