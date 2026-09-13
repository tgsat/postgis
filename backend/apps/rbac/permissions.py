from rest_framework.permissions import BasePermission

from apps.accounts.models import Membership


def user_has_role(user, role, company=None):
    if user and user.is_system_admin:
        return True
    if not user or not user.is_authenticated:
        return False
    user_roles = user.user_roles.all()
    if company is not None:
        return user_roles.filter(role__name__iexact=role, company=company).exists() or user_roles.filter(
            role__name__iexact=role, company__isnull=True
        ).exists()
    return user_roles.filter(role__name__iexact=role).exists()


def user_has_permission(user, resource, action):
    if user and user.is_system_admin:
        return True
    if not user or not user.is_authenticated:
        return False
    roles = [
        r.role
        for r in user.user_roles.all().select_related("role").prefetch_related("role__permissions")
    ]
    for role in roles:
        if role.is_all:
            return True
        if role.permissions.filter(resource=resource, action=action).exists():
            return True
    return False


class IsAuthenticatedSystem(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class IsSystemAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_system_admin)


class IsSystemOrCompanyAdmin(BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_system_admin:
            return True
        return user_has_role(request.user, "company_admin")


class HasPermissions(BasePermission):
    resource = None
    action = None

    def has_permission(self, request, view):
        return user_has_permission(request.user, view.resource, getattr(view, "permission_action", self.action))


def _object_company_id(obj):
    """Resolve the owning company id of any tenant-scoped object."""
    if hasattr(obj, "company_id") and obj.company_id is not None:
        return obj.company_id
    if hasattr(obj, "company") and hasattr(obj.company, "id"):
        return obj.company.id
    if getattr(obj, "dataset", None) is not None and hasattr(obj.dataset, "company_id"):
        return obj.dataset.company_id
    if getattr(obj, "project", None) is not None and hasattr(obj.project, "company_id"):
        return obj.project.company_id
    if getattr(obj, "form", None) is not None and hasattr(obj.form, "company_id"):
        return obj.form.company_id
    return None


def user_companies(user):
    if user and user.is_system_admin:
        return None
    if not user or not user.is_authenticated:
        return set()
    return set(Membership.objects.filter(user=user).values_list("company_id", flat=True))


class InCompanyScope(BasePermission):
    """Object-level guard: only objects belonging to the user's companies are accessible.

    Must be combined with an authentication/authorization permission class.
    """

    def has_permission(self, request, view):
        return True

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_system_admin:
            return True
        company_id = _object_company_id(obj)
        if company_id is None:
            return True
        return company_id in user_companies(user)


def company_scope(user):
    if user.is_system_admin:
        return None
    return Membership.objects.filter(user=user, is_primary=True).values_list("company_id", flat=True).first()