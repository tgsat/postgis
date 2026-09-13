import os
from pathlib import Path

from django.conf import settings
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.rbac.audit import audit
from apps.rbac.permissions import IsSystemAdmin

from .models import BackupJob, StorageUsage, SystemSetting
from .services import (
    BackupJobSerializer,
    StorageUsageSerializer,
    SystemSettingSerializer,
    database_info,
    restore_from_file,
    run_backup,
)


class SystemSettingViewSet(viewsets.ModelViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [IsSystemAdmin]
    search_fields = ["key"]

    def perform_create(self, serializer):
        serializer.save()
        audit(
            self.request,
            "ADMIN",
            "settings",
            str(serializer.instance.pk),
            f'Created system setting "{serializer.instance.key}"',
        )

    def perform_update(self, serializer):
        serializer.save()
        audit(
            self.request,
            "ADMIN",
            "settings",
            str(serializer.instance.pk),
            f'Updated system setting "{serializer.instance.key}"',
        )

    def perform_destroy(self, instance):
        audit(self.request, "ADMIN", "settings", str(instance.pk), f'Deleted system setting "{instance.key}"')
        instance.delete()


class BackupJobViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BackupJob.objects.all()
    serializer_class = BackupJobSerializer
    permission_classes = [IsSystemAdmin]
    filterset_fields = ["status"]

    @action(detail=False, methods=["post"])
    def create_backup(self, request):
        job = run_backup(user=request.user)
        audit(request, "CREATE", "backup", str(job.pk), f'Backup job "{job.name}" -> {job.status}')
        if job.status == "success":
            return Response(BackupJobSerializer(job).data)
        return Response(BackupJobSerializer(job).data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=["post"])
    def restore(self, request):
        file = request.FILES.get("file")
        if not file:
            return Response({"detail": "backup file is required."}, status=status.HTTP_400_BAD_REQUEST)
        export_dir = settings.EXPORT_STORAGE
        export_dir.mkdir(parents=True, exist_ok=True)
        target = export_dir / file.name
        with open(target, "wb") as handle:
            handle.write(file.read())
        job = restore_from_file(str(target), user=request.user)
        audit(request, "MANAGE", "backup", str(job.pk), f'Restore "{job.name}" -> {job.status}')
        if job.status == "success":
            return Response(BackupJobSerializer(job).data)
        return Response(BackupJobSerializer(job).data, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StorageUsageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StorageUsage.objects.all()
    serializer_class = StorageUsageSerializer
    permission_classes = [IsSystemAdmin]


@api_view(["GET"])
@permission_classes([IsSystemAdmin])
def database_info_view(request):
    return Response(database_info())


@api_view(["GET"])
@permission_classes([IsSystemAdmin])
def storage_listing(request):
    root = settings.STORAGE_ROOT
    items = []
    for path in sorted(root.rglob("*")):
        if path.is_file():
            items.append(
                {
                    "path": str(path.relative_to(root)),
                    "size": path.stat().st_size,
                    "kind": path.suffix.lstrip(".") or "file",
                }
            )
    items.sort(key=lambda i: i["size"], reverse=True)
    return Response({"root": str(root), "files": items[:500]})