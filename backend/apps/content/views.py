import os
import shutil

from django.conf import settings
from django.db import transaction
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.layers.models import Dataset
from apps.projects.models import Map, MapLayer, Project
from apps.projects.serializers import scope_company
from apps.rbac.audit import audit
from apps.rbac.permissions import InCompanyScope, IsSystemOrCompanyAdmin

from .models import ImportJob, Item
from .serializers import ImportJobSerializer, ItemFieldsSerializer, ItemSerializer

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
ALLOWED_EXTENSIONS = {".zip", ".gpkg", ".csv", ".xlsx"}
CONTAINER_KIND = {".zip": "zip", ".gpkg": "gpkg", ".csv": "csv", ".xlsx": "xlsx"}


def _company_for_request(request, requested_id=None):
    if request.user.is_system_admin:
        return requested_id
    return scope_company(request)


def _default_name_for(source_name):
    from .models import default_item_name

    return default_item_name(source_name)


class ImportJobViewSet(mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """Two-phase async upload pipeline: analyze (preview) -> publish."""

    serializer_class = ImportJobSerializer
    permission_classes = [IsSystemOrCompanyAdmin]
    queryset = ImportJob.objects.select_related("company", "created_by")

    def get_permissions(self):
        if self.action in ("retrieve", "list"):
            self.permission_classes = [IsAuthenticated]
        return super().get_permissions()

    def get_queryset(self):
        company_id = scope_company(self.request)
        if company_id is None:
            return ImportJob.objects.all()
        return ImportJob.objects.filter(company_id=company_id)

    def create(self, request, *args, **kwargs):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)
        if file.size and file.size > MAX_UPLOAD_BYTES:
            return Response({"detail": "File terlalu besar (maksimum 200 MB)."}, status=status.HTTP_400_BAD_REQUEST)
        name = (file.name or "").lower()
        ext = os.path.splitext(name)[1]
        if ext not in ALLOWED_EXTENSIONS:
            return Response(
                {"detail": "Format tidak didukung. Gunakan .zip (SHP/GDB), .gpkg, .csv, atau .xlsx."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        company_id = _company_for_request(request, request.data.get("company"))
        if not company_id:
            return Response(
                {"detail": "company is required (atau anda harus punya company aktif)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from apps.accounts.models import Company

        company = Company.objects.filter(pk=company_id).first()
        if not company:
            return Response({"detail": "Company tidak ditemukan."}, status=status.HTTP_400_BAD_REQUEST)

        job = ImportJob.objects.create(
            company=company,
            file_name=file.name,
            container_kind=CONTAINER_KIND[ext],
            status="pending",
            created_by=request.user,
        )
        dest_dir = settings.STORAGE_ROOT / "uploads" / str(job.id)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / file.name
        with dest.open("wb") as out:
            for chunk in file.chunks():
                out.write(chunk)
        job.file_path = str(dest)
        job.save(update_fields=["file_path"])

        from .tasks import analyze_import_job

        task = analyze_import_job.delay(job.id, request.user.id)
        job.celery_task_id = task.id
        job.save(update_fields=["celery_task_id"])
        audit(request, "IMPORT", "import-job", str(job.id), f'Add Data upload "{file.name}" queued')
        return Response(ImportJobSerializer(job).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        job = self.get_object()
        if job.status not in ("ready", "analyzing"):
            return Response({"detail": f'Job dalam status "{job.status}", belum siap dipublish.'}, status=status.HTTP_400_BAD_REQUEST)

        payload = request.data
        settings = {
            "layers": payload.get("layers") or [],
            "project": payload.get("project"),
            "field_mapping": payload.get("field_mapping") or {},
        }
        with transaction.atomic():
            job.config = settings
            job.status = "processing"
            job.error = ""
            job.save(update_fields=["config", "status", "error"])

        from .tasks import publish_import_job

        task = publish_import_job.delay(job.id, request.user.id)
        job.celery_task_id = task.id
        job.save(update_fields=["celery_task_id"])
        audit(request, "IMPORT", "import-job", str(job.id), f'Add Data publish "{job.file_name}" queued')
        return Response(ImportJobSerializer(job).data)


class ItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsSystemOrCompanyAdmin, InCompanyScope]
    serializer_class = ItemSerializer
    search_fields = ["title"]
    filterset_fields = ["item_type", "company", "hosted", "sharing_level"]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            self.permission_classes = [IsAuthenticated]
        return super().get_permissions()

    def get_queryset(self):
        company_id = scope_company(self.request)
        qs = Item.objects.select_related("company", "dataset", "map", "owner").order_by("-created_at")
        if company_id is not None:
            qs = qs.filter(company_id=company_id)
        return qs

    def perform_partial_update(self, serializer):
        item = serializer.save()
        from apps.rbac.audit import audit

        audit(self.request, "UPDATE", "item", str(item.pk), f'Updated item "{item.title}"')

    def perform_destroy(self, instance):
        if instance.delete_protection:
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied(
                "Item ini dilindungi oleh Delete Protection dan tidak dapat dihapus. "
                "Nonaktifkan proteksi tersebut terlebih dahulu di tab Settings."
            )
        from apps.rbac.audit import audit

        audit(self.request, "DELETE", "item", str(instance.pk), f'Deleted item "{instance.title}"')
        if instance.item_type == "feature_layer" and instance.dataset_id:
            instance.dataset.delete()
        elif instance.item_type == "web_map" and instance.map_id:
            instance.map.delete()
        else:
            instance.delete()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.delete_protection:
            return Response(
                {
                    "detail": "Item ini dilindungi oleh Delete Protection dan tidak dapat dihapus. "
                    "Nonaktifkan proteksi tersebut terlebih dahulu di tab Settings."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        self.perform_destroy(instance)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["put"])
    def fields(self, request, pk=None):
        item = self.get_object()
        if item.item_type != "feature_layer" or not item.dataset_id:
            return Response({"detail": "fields hanya tersedia untuk Feature Layer item."}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ItemFieldsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dataset = item.dataset
        schema = dataset.schema or {}
        if not isinstance(schema, dict):
            schema = {}
        schema["fields"] = serializer.validated_data["fields"]
        dataset.schema = schema
        dataset.save(update_fields=["schema", "updated_at"])
        audit(request, "UPDATE", "dataset", str(dataset.pk), f'Updated fields/domains of "{dataset.name}"')
        return Response({"status": "ok", "fields": schema["fields"]})

    @action(detail=True, methods=["post"])
    def add_to_web_map(self, request, pk=None):
        item = self.get_object()
        if item.item_type != "feature_layer" or not item.dataset_id:
            return Response({"detail": "hanya Feature Layer yang bisa ditambahkan ke Web Map."}, status=status.HTTP_400_BAD_REQUEST)
        company_id = scope_company(request)
        allowed_qs = Map.objects.all()
        if company_id is not None:
            allowed_qs = allowed_qs.filter(project__company_id=company_id)

        map_id = request.data.get("map_id")
        if map_id:
            map_obj = allowed_qs.filter(pk=map_id).first()
            if not map_obj:
                return Response({"detail": "Web Map tidak ditemukan / tidak dalam scope."}, status=status.HTTP_403_FORBIDDEN)
            _, created = MapLayer.objects.get_or_create(map=map_obj, dataset=item.dataset, defaults={"order": map_obj.map_layers.count()})
            return Response({"map_id": map_obj.id, "added": created})

        project_id = request.data.get("project")
        if not project_id:
            return Response({"detail": "project required untuk membuat Web Map baru."}, status=status.HTTP_400_BAD_REQUEST)
        project = Project.objects.filter(pk=project_id).first()
        if not project:
            return Response({"detail": "Project tidak ditemukan."}, status=status.HTTP_400_BAD_REQUEST)
        if company_id is not None and project.company_id != company_id:
            return Response({"detail": "Project di luar scope."}, status=status.HTTP_403_FORBIDDEN)
        title = request.data.get("name") or f"Peta {item.title}"
        map_obj = Map.objects.create(
            project=project,
            name=title,
            basemap=request.data.get("basemap", "osm"),
            created_by=request.user if request.user.is_authenticated else None,
        )
        MapLayer.objects.create(map=map_obj, dataset=item.dataset, order=0)
        audit(request, "CREATE", "map", str(map_obj.pk), f'Add to new Web Map "{title}"')
        return Response({"map_id": map_obj.id, "added": True})