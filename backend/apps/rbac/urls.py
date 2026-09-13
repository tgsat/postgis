from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet, PermissionViewSet, RoleViewSet, UserRoleViewSet

router = DefaultRouter()
router.register("permissions", PermissionViewSet, basename="permission")
router.register("roles", RoleViewSet, basename="role")
router.register("user-roles", UserRoleViewSet, basename="user-role")
router.register("audit-logs", AuditLogViewSet, basename="audit-log")

urlpatterns = router.urls