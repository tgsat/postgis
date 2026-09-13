from django.urls import path

from .public_views import public_map_detail, public_map_layer_geojson

urlpatterns = [
    path("maps/<int:pk>/", public_map_detail, name="public-map-detail"),
    path("maps/<int:pk>/layers/<int:dataset_pk>/geojson/", public_map_layer_geojson, name="public-map-layer-geojson"),
]