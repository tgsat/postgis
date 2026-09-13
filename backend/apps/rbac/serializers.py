from rest_framework import serializers

from .models import AuditLog, Permission, Role, UserRole


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "name", "action", "resource", "description"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = PermissionSerializer(many=True, read_only=True)
    permission_ids = serializers.PrimaryKeyRelatedField(
        queryset=Permission.objects.all(), many=True, source="permissions", write_only=True, required=False
    )

    class Meta:
        model = Role
        fields = [
            "id", "name", "description", "is_system", "is_company_default", "is_all",
            "permissions", "permission_ids",
        ]


class UserRoleSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)
    company_name = serializers.CharField(source="company.name", read_only=True, allow_null=True)

    class Meta:
        model = UserRole
        fields = ["id", "user", "username", "role", "role_name", "company", "company_name"]


class AuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True, allow_null=True)

    class Meta:
        model = AuditLog
        fields = ["id", "user", "username", "action", "resource_type", "resource_id", "detail", "ip", "created_at"]