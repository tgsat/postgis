from django.http import HttpResponse
import json
from rest_framework import serializers

from apps.accounts.models import Company
from apps.projects.serializers import scope_company

from .models import Attachment, Dataset, Feature


class DatasetSerializer(serializers.ModelSerializer):
    feature_count = serializers.SerializerMethodField()
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Dataset
        fields = [
            "id", "company", "company_name", "project", "name", "table_name",
            "geom_type", "srid", "schema", "is_public", "is_published",
            "feature_count", "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]
        extra_kwargs = {"table_name": {"required": False}}

    def get_feature_count(self, obj):
        return obj.features.count()

    def validate_company(self, value):
        request = self.context.get("request")
        if request and not request.user.is_system_admin:
            company_id = scope_company(request)
            if company_id is None or company_id != value.id:
                raise serializers.ValidationError("No access to this company.")
        return value

    def create(self, validated_data):
        from django.db.models.functions import Length

        name = validated_data.get("name", "").strip()
        if not validated_data.get("table_name"):
            validated_data["table_name"] = name.lower().replace(" ", "_")[:60]
        base = validated_data["table_name"]
        if "company" not in validated_data:
            request = self.context.get("request")
            from apps.projects.serializers import scope_company

            company_id = scope_company(request)
            if company_id:
                validated_data["company"] = Company.objects.get(pk=company_id)
        colliding = Dataset.objects.filter(table_name__startswith=base).count()
        if colliding:
            validated_data["table_name"] = f"{base}_{colliding + 1}"
        return super().create(validated_data)


class FeatureGeoJSONSerializer(serializers.Serializer):
    """GeoJSON Feature serializer."""
    type = serializers.SerializerMethodField()
    id = serializers.IntegerField(read_only=True)
    properties = serializers.SerializerMethodField()
    geometry = serializers.SerializerMethodField()

    def get_type(self, obj):
        return "Feature"

    def get_geometry(self, obj):
        if not obj.geom:
            return None
        return json.loads(obj.geom.geojson)

    def get_properties(self, obj):
        return {
            **obj.props,
            "feature_id": obj.pk,
            "created_at": obj.created_at.isoformat() if obj.created_at else None,
            "updated_at": obj.updated_at.isoformat() if obj.updated_at else None,
        }


class FeatureListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Feature
        fields = ["id", "dataset", "geom", "props", "created_at", "updated_at"]

    def to_representation(self, obj):
        data = super().to_representation(obj)
        data["geom"] = json.loads(obj.geom.geojson) if obj.geom else None
        return data


class FeatureCreateSerializer(serializers.Serializer):
    type = serializers.CharField(default="Feature", required=False)
    geometry = serializers.JSONField(required=False)
    properties = serializers.JSONField(required=False, default=dict)

    def create(self, validated_data):
        dataset = self.context.get("dataset")
        geometry = validated_data.get("geometry")
        props = validated_data.get("properties") or {}
        geom = None
        if geometry:
            from django.contrib.gis.geos import GEOSGeometry

            geom = GEOSGeometry(json.dumps(geometry), srid=4326)
            if geom.srid != 4326:
                geom.transform(4326)
        request = self.context["request"]
        return Feature.objects.create(
            dataset=dataset,
            geom=geom,
            props=props,
            created_by=request.user if request and request.user.is_authenticated else None,
        )

    def update(self, instance, validated_data):
        geometry = validated_data.get("geometry")
        props = validated_data.pop("properties", None)
        if geometry is not None:
            from django.contrib.gis.geos import GEOSGeometry

            geom = GEOSGeometry(json.dumps(geometry), srid=4326)
            if geom.srid != 4326:
                geom.transform(4326)
            instance.geom = geom
        if props is not None:
            instance.props = props
        instance.save()
        return instance


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "feature", "file", "url", "kind", "caption", "size", "created_at"]
        read_only_fields = ["size", "created_at"]

    def get_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


def export_geojson_response(features_qs, filename):
    import json

    features = []
    for f in features_qs:
        features.append(
            {
                "type": "Feature",
                "id": f.pk,
                "geometry": json.loads(f.geom.geojson) if f.geom else None,
                "properties": f.props,
            }
        )
    collection = {"type": "FeatureCollection", "features": features}
    return HttpResponse(
        json.dumps(collection),
        content_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def export_csv_response(features_qs, filename):
    import csv
    import io

    features = list(features_qs)
    columns = ["id", "geometry"]
    for f in features:
        for key in (f.props or {}).keys():
            if key not in columns:
                columns.append(key)

    handle = io.StringIO()
    writer = csv.writer(handle)
    writer.writerow(columns)
    for f in features:
        props = f.props or {}
        row = [f.pk, f.geom.geojson if f.geom else ""]
        for col in columns[2:]:
            row.append(props.get(col, ""))
        writer.writerow(row)
    return HttpResponse(
        handle.getvalue(),
        content_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )