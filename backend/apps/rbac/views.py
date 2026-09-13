from rest_framework import viewsets

from apps.rbac.audit import audit

from .models import AuditLog, Permission, Role, UserRole
from .permissions import IsSystemAdmin
from .serializers import AuditLogSerializer, PermissionSerializer, RoleSerializer, UserRoleSerializer


class PermissionViewSet(viewsets.ModelViewSet):
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsSystemAdmin]
    search_fields = ["name", "resource", "action"]

    def perform_create(self, serializer):
        serializer.save()
        audit(self.request, "ADMIN", "role", str(serializer.instance.pk), f'Created permission "{serializer.instance.name}"')


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsSystemAdmin]
    search_fields = ["name"]

    def perform_create(self, serializer):
        serializer.save()
        audit(self.request, "CREATE", "role", str(serializer.instance.pk), f'Created role "{serializer.instance.name}"')

    def perform_update(self, serializer):
        serializer.save()
        audit(self.request, "UPDATE", "role", str(serializer.instance.pk), f'Updated role "{serializer.instance.name}"')

    def perform_destroy(self, instance):
        audit(self.request, "DELETE", "role", str(instance.pk), f'Deleted role "{instance.name}"')
        instance.delete()


class UserRoleViewSet(viewsets.ModelViewSet):
    queryset = UserRole.objects.all()
    serializer_class = UserRoleSerializer
    permission_classes = [IsSystemAdmin]

    def perform_create(self, serializer):
        serializer.save()
        audit(self.request, "CREATE", "role", str(serializer.instance.pk), "Granted user role")

    def perform_update(self, serializer):
        serializer.save()
        audit(self.request, "UPDATE", "role", str(serializer.instance.pk), "Updated user role")

    def perform_destroy(self, instance):
        audit(self.request, "DELETE", "role", str(instance.pk), "Revoked user role")
        instance.delete()


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsSystemAdmin]
    search_fields = ["user__username", "action", "resource_type"]
    filterset_fields = ["action", "resource_type"]