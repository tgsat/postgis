from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from apps.accounts.models import Company, Membership, User

from .models import AuditLog, Permission, Role, UserRole


class BaseRegistered:
    pass


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ["username", "email", "first_name", "is_system_admin", "role_type", "is_active"]
    list_filter = ["is_system_admin", "role_type", "is_active", "is_staff"]
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Platform", {"fields": ("is_system_admin", "role_type", "phone")}),
    )


@admin.register(Company)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ["name", "org_id", "code", "created_at"]
    search_fields = ["name", "code", "org_id"]
    readonly_fields = ["org_id"]


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ["user", "company", "role", "is_primary"]
    list_filter = ["role", "is_primary"]


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ["name", "is_system", "is_all", "is_company_default"]
    filter_horizontal = ["permissions"]


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ["name", "action", "resource"]
    list_filter = ["action", "resource"]


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = ["user", "role", "company"]


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "user", "action", "resource_type", "resource_id", "ip"]
    list_filter = ["action", "resource_type"]
    readonly_fields = ["user", "action", "resource_type", "resource_id", "detail", "ip", "created_at"]