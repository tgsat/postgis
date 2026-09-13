import logging

from django.contrib.auth import get_user_model
from django.db.models import Q

from apps.rbac.models import Permission, Role
from apps.sysadmin.models import SystemSetting

logger = logging.getLogger(__name__)

DEFAULT_ACTIONS = ["VIEW", "CREATE", "READ", "UPDATE", "DELETE", "EXPORT", "IMPORT", "SHARE", "PUBLISH", "MANAGE", "ADMIN"]
DEFAULT_RESOURCES = [
    "system", "user", "company", "project", "map", "layer", "feature",
    "form", "dashboard", "attachment", "database", "storage", "backup", "audit", "api", "settings",
]


def is_initialized():
    return SystemSetting.get_bool("SYSTEM_INITIALIZED", default=False)


def seed_permissions():
    created = 0
    existing = set(Permission.objects.values_list("name", flat=True))
    for resource in DEFAULT_RESOURCES:
        for action in DEFAULT_ACTIONS:
            name = f"{action}:{resource}"
            if name not in existing:
                Permission.objects.create(name=name, action=action, resource=resource)
                created += 1
    return created


def seed_roles():
    all_perms = Permission.objects.all()
    roles = {
        "System Administrator": {"is_system": True, "is_all": True},
        "Company Admin": {},
        "GIS Manager": {},
        "Editor": {},
        "Surveyor": {},
        "Viewer": {"is_company_default": True},
    }
    for name, flags in roles.items():
        role, _ = Role.objects.get_or_create(name=name, defaults={**flags, "description": f"Default {name} role"})
        if flags.get("is_all"):
            role.permissions.set(all_perms)
        elif name == "Company Admin":
            role.permissions.set(
                all_perms.exclude(resource__in=["database", "storage", "backup", "audit", "api", "settings", "system"])
            )
        elif name == "GIS Manager":
            role.permissions.set(
                all_perms.filter(
                    resource__in=["project", "map", "layer", "feature", "form", "dashboard", "attachment", "user"]
                ).exclude(Q(action="ADMIN") | Q(action="DELETE", resource="user"))
            )
        elif name == "Editor":
            role.permissions.set(
                all_perms.filter(resource__in=["feature", "attachment", "form"]).exclude(action="ADMIN")
            )
        elif name == "Surveyor":
            role.permissions.set(
                all_perms.filter(resource="feature", action__in=["VIEW", "CREATE", "READ", "UPDATE"])
            )
        elif name == "Viewer":
            role.permissions.set(all_perms.filter(action__in=["VIEW", "READ"]))
    return list(roles.keys())


def create_system_admin(name, username, email, password):
    User = get_user_model()
    admin = User.objects.filter(Q(username=username) | Q(email=email)).first()
    created = False
    if admin:
        admin.is_system_admin = True
        admin.is_staff = True
        admin.is_superuser = True
        admin.role_type = "system_admin"
        admin.save()
    else:
        if len(password) < 8:
            raise ValueError("Password must be at least 8 characters.")
        parts = (name or "").split(" ", 1)
        admin = User.objects.create_user(
            username=username,
            email=email,
            first_name=parts[0] if parts else "",
            last_name=parts[1] if len(parts) > 1 else "",
            password=password,
        )
        admin.is_system_admin = True
        admin.is_staff = True
        admin.is_superuser = True
        admin.role_type = "system_admin"
        admin.save()
        created = True
    role, _ = Role.objects.get_or_create(name="System Administrator", defaults={"is_system": True, "is_all": True})
    admin.user_roles.get_or_create(role=role, company=None)
    return admin, created


def initialize_platform(name="", username="", email="", password=""):
    """Shared init logic used by both CLI command and HTTP endpoint."""
    if is_initialized():
        raise ValueError("System is already initialized. Additional system administrators must be created via the admin console.")
    seed_permissions()
    seed_roles()
    admin, created = create_system_admin(name, username, email, password)
    SystemSetting.set("SYSTEM_INITIALIZED", "true", value_type="bool")
    return admin, created