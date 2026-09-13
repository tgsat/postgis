"""Read-only public endpoints for sharing maps/datasets without authentication."""

import json

from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.layers.models import Dataset, Feature
from apps.layers.serializers import FeatureGeoJSONSerializer

from .models import Map


@api_view(["GET"])
@permission_classes([AllowAny])
def public_map_detail(request, pk):
    map_obj = get_object_or_404(Map, pk=pk, is_public=True)
    layers = [
        {
            "id": ml.dataset_id,
            "name": ml.dataset.name,
            "geom_type": ml.dataset.geom_type,
            "order": ml.order,
            "visible": ml.visible,
            "feature_count": ml.dataset.features.count(),
        }
        for ml in map_obj.map_layers.select_related("dataset").filter(visible=True, dataset__is_public=True)
    ]
    center = map_obj.initial_center
    return Response(
        {
            "id": map_obj.pk,
            "name": map_obj.name,
            "description": map_obj.description,
            "basemap": map_obj.basemap,
            "initial_zoom": map_obj.initial_zoom,
            "initial_center": json.loads(center.geojson) if center else None,
            "company": map_obj.project.company.name,
            "layers": layers,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_map_layer_geojson(request, pk, dataset_pk):
    map_obj = get_object_or_404(Map, pk=pk, is_public=True)
    dataset = get_object_or_404(
        Dataset.objects.filter(is_public=True, map_links__map=map_obj, map_links__visible=True), pk=dataset_pk
    )
    qs = Feature.objects.filter(dataset=dataset)[:10000]
    serializer = FeatureGeoJSONSerializer(qs, many=True)
    return Response({"type": "FeatureCollection", "features": serializer.data})