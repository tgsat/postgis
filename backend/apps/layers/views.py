from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from rest_framework.permissions import IsAuthenticated

from apps.projects.serializers import scope_company
from apps.rbac.permissions import HasPermissions, InCompanyScope, IsSystemOrCompanyAdmin

from .models import Attachment, Dataset, Feature
from .serializers import (
    AttachmentSerializer,
    DatasetSerializer,
    FeatureCreateSerializer,
    FeatureGeoJSONSerializer,
    FeatureListSerializer,
    export_csv_response,
    export_geojson_response,
)


def _parse_bbox(value, field="bbox"):
    try:
        parts = [float(x) for x in value.replace(";", ",").split(",")]
        if len(parts) != 4:
            raise ValueError
        return parts
    except (ValueError, AttributeError):
        raise RuntimeError(f"{field} must be minX,minY,maxX,maxY in WGS84 degrees.")


def _envelope_box(center_lng, center_lat, radius_km):
    from math import cos, radians

    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * max(0.05, abs(cos(radians(center_lat))))
    dlat = radius_km / km_per_deg_lat
    dlon = radius_km / km_per_deg_lon
    return center_lng - dlon, center_lat - dlat, center_lng + dlon, center_lat + dlat


def _haversine_km(lat1, lon1, lat2, lon2):
    from math import asin, cos, radians, sin, sqrt

    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(a))


class DatasetViewSet(viewsets.ModelViewSet):
    serializer_class = DatasetSerializer
    permission_classes = [IsSystemOrCompanyAdmin]
    search_fields = ["name", "table_name", "geom_type"]
    filterset_fields = ["company", "project", "is_public", "is_published", "geom_type"]
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            self.permission_classes = [IsAuthenticated]
        return super().get_permissions()

    def get_queryset(self):
        company_id = scope_company(self.request)
        if company_id is None:
            return Dataset.objects.all()
        return Dataset.objects.filter(company_id=company_id)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        from apps.rbac.audit import audit

        audit(self.request, "CREATE", "dataset", str(serializer.instance.pk), f'Created dataset "{serializer.instance.name}"')

    def perform_update(self, serializer):
        serializer.save()
        from apps.rbac.audit import audit

        audit(self.request, "UPDATE", "dataset", str(serializer.instance.pk), f'Updated dataset "{serializer.instance.name}"')

    def perform_destroy(self, instance):
        from apps.rbac.audit import audit

        audit(self.request, "DELETE", "dataset", str(instance.pk), f'Deleted dataset "{instance.name}"')
        instance.delete()

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        dataset = self.get_object()
        dataset.is_published = True
        dataset.save(update_fields=["is_published"])
        from apps.rbac.audit import audit

        audit(request, "PUBLISH", "dataset", str(dataset.pk), f'Published dataset "{dataset.name}"')
        return Response({"status": "published"})

    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        dataset = self.get_object()
        dataset.is_published = False
        dataset.save(update_fields=["is_published"])
        from apps.rbac.audit import audit

        audit(request, "PUBLISH", "dataset", str(dataset.pk), f'Unpublished dataset "{dataset.name}"')
        return Response({"status": "unpublished"})

    @action(detail=True, methods=["post"])
    def ingest(self, request, pk=None):
        """Ingest uploaded file (geojson/csv/xlsx) into the dataset via Celery."""
        from django.core.files.uploadedfile import InMemoryUploadedFile

        dataset = self.get_object()
        file: InMemoryUploadedFile = request.FILES.get("file")
        if not file:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)
        content = file.read().decode("utf-8", errors="replace")
        if file.name.lower().endswith(".geojson") or content.lstrip().startswith("{"):
            from .tasks import ingest_geojson

            task = ingest_geojson.delay(dataset.id, content, request.user.id)
        else:
            from .tasks import ingest_csv

            task = ingest_csv.delay(dataset.id, content, user_id=request.user.id)
        from apps.rbac.audit import audit

        audit(request, "IMPORT", "dataset", str(dataset.pk), f'Queued ingest of "{file.name}" into dataset "{dataset.name}"')
        return Response({"task_id": task.id, "status": "queued"})


class FeatureViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [HasPermissions, InCompanyScope]
    resource = "feature"
    filterset_fields = ["dataset"]
    search_fields = ["props"]
    ACTION_MAP = {
        "list": "READ",
        "retrieve": "READ",
        "create": "CREATE",
        "update": "UPDATE",
        "partial_update": "UPDATE",
        "destroy": "DELETE",
        "export_geojson": "EXPORT",
        "export_csv": "EXPORT",
        "geojson": "READ",
    }
    permission_action = "READ"

    def get_permissions(self):
        self.permission_action = self.ACTION_MAP.get(self.action, "READ")
        return super().get_permissions()

    def get_queryset(self):
        company_id = scope_company(self.request)
        qs = Feature.objects.select_related("dataset").order_by("-created_at")
        if company_id is not None:
            qs = qs.filter(dataset__company_id=company_id)
        dataset = self.request.query_params.get("dataset")
        if dataset:
            qs = qs.filter(dataset_id=dataset)
        qs = self._apply_spatial_filters(qs)
        return qs

    def _apply_spatial_filters(self, qs):
        """Support spatial query params: bbox, near (point+radius km) and intersects (WKT)."""
        from django.contrib.gis.geos import Polygon

        params = self.request.query_params

        bbox = params.get("bbox")
        if bbox:
            minx, miny, maxx, maxy = _parse_bbox(bbox)
            envelope = Polygon.from_bbox((minx, miny, maxx, maxy))
            envelope.srid = 4326
            qs = qs.filter(geom__isnull=False).filter(geom__intersects=envelope)

        near = params.get("near")
        if near:
            try:
                parts = [float(x) for x in near.replace(";", ",").split(",")]
                if len(parts) != 3:
                    raise ValueError
                lng, lat, radius_km = parts
            except (ValueError, AttributeError):
                raise RuntimeError("near must be lng,lat,radiusKm (radius in kilometers).")
            bounds = _envelope_box(lng, lat, radius_km)
            envelope = Polygon.from_bbox(bounds)
            envelope.srid = 4326
            candidates = qs.filter(geom__isnull=False).filter(geom__intersects=envelope)
            ids = [
                f.pk
                for f in candidates.select_related(None).only("pk", "geom")
                if f.geom and _haversine_km(lat, lng, f.geom.centroid.y, f.geom.centroid.x) <= radius_km
            ]
            qs = qs.filter(pk__in=ids)

        intersects = params.get("intersects")
        if intersects:
            from django.contrib.gis.geos import GEOSGeometry

            geom = GEOSGeometry(intersects, srid=4326)
            if geom.srid != 4326:
                geom.transform(4326)
            qs = qs.filter(geom__isnull=False).filter(geom__intersects=geom)

        return qs

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return FeatureCreateSerializer
        return FeatureListSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action in ("create", "update", "partial_update"):
            ctx["dataset"] = self._dataset_for_request()
        return ctx

    def _scoped_datasets(self):
        qs = Dataset.objects.all()
        company_id = scope_company(self.request)
        if company_id is not None:
            qs = qs.filter(company_id=company_id)
        return qs

    def _dataset_for_request(self):
        dataset = self.request.query_params.get("dataset")
        if not dataset:
            return None
        return self._scoped_datasets().filter(pk=dataset).first()

    def create(self, request, *args, **kwargs):
        dataset = self._dataset_for_request()
        if not dataset:
            return Response(
                {"detail": "dataset query parameter is required or not permitted."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = self.get_serializer(data=request.data, context={"request": request, "dataset": dataset})
        serializer.is_valid(raise_exception=True)
        feature = serializer.save()
        from apps.rbac.audit import audit

        audit(request, "CREATE", "feature", str(feature.pk), f'Created feature #{feature.pk} in dataset "{dataset.name}"')
        return Response(FeatureGeoJSONSerializer(feature).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        feature = self.get_object()
        serializer = self.get_serializer(feature, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        from apps.rbac.audit import audit

        audit(request, "UPDATE", "feature", str(feature.pk), f'Updated feature #{feature.pk}')
        return Response(FeatureGeoJSONSerializer(feature).data)

    def partial_update(self, request, *args, **kwargs):
        feature = self.get_object()
        serializer = self.get_serializer(feature, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        from apps.rbac.audit import audit

        audit(request, "UPDATE", "feature", str(feature.pk), f'Partially updated feature #{feature.pk}')
        return Response(FeatureGeoJSONSerializer(feature).data)

    def perform_destroy(self, instance):
        from apps.rbac.audit import audit

        dataset_name = instance.dataset.name if instance.dataset_id else ""
        audit(self.request, "DELETE", "feature", str(instance.pk), f'Deleted feature #{instance.pk} ({dataset_name})')
        instance.delete()

    @action(detail=False, methods=["get"], url_path="exports/geojson")
    def export_geojson(self, request):
        qs = self.get_queryset()
        filename = request.query_params.get("filename", "export.geojson")
        return export_geojson_response(qs, filename)

    @action(detail=False, methods=["get"], url_path="exports/csv")
    def export_csv(self, request):
        qs = self.get_queryset()
        filename = request.query_params.get("filename", "export.csv")
        return export_csv_response(qs, filename)

    @action(detail=False, methods=["get"])
    def geojson(self, request):
        qs = self.get_queryset()
        serializer = FeatureGeoJSONSerializer(qs, many=True)
        return Response({"type": "FeatureCollection", "features": serializer.data})


class AttachmentViewSet(viewsets.ModelViewSet):
    serializer_class = AttachmentSerializer
    permission_classes = [IsSystemOrCompanyAdmin, InCompanyScope]
    filterset_fields = ["feature"]

    def get_queryset(self):
        company_id = scope_company(self.request)
        qs = Attachment.objects.select_related("feature__dataset")
        if company_id is not None:
            qs = qs.filter(feature__dataset__company_id=company_id)
        return qs

    def perform_create(self, serializer):
        file = self.request.FILES.get("file")
        serializer.save(
            created_by=self.request.user,
            size=file.size if file else 0,
        )
        from apps.rbac.audit import audit

        audit(self.request, "CREATE", "attachment", str(serializer.instance.pk), "Uploaded attachment")

    def perform_destroy(self, instance):
        from apps.rbac.audit import audit

        audit(self.request, "DELETE", "attachment", str(instance.pk), f'Deleted attachment "{instance.file.name}"')
        instance.delete()