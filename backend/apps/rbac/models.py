from django.conf import settings
from django.db import models


ACTION_CHOICES = [
    ("VIEW", "View"),
    ("CREATE", "Create"),
    ("READ", "Read"),
    ("UPDATE", "Update"),
    ("DELETE", "Delete"),
    ("EXPORT", "Export"),
    ("IMPORT", "Import"),
    ("SHARE", "Share"),
    ("PUBLISH", "Publish"),
    ("MANAGE", "Manage"),
    ("ADMIN", "Admin"),
]

RESOURCE_CHOICES = [
    ("system", "System"),
    ("user", "User"),
    ("company", "Company"),
    ("project", "Project"),
    ("map", "Map"),
    ("layer", "Layer"),
    ("feature", "Feature"),
    ("form", "Form"),
    ("dashboard", "Dashboard"),
    ("attachment", "Attachment"),
    ("database", "Database"),
    ("storage", "Storage"),
    ("backup", "Backup"),
    ("audit", "Audit Log"),
    ("api", "API"),
    ("webhook", "Webhook"),
    ("settings", "Settings"),
]


class Permission(models.Model):
    name = models.CharField(max_length=100, unique=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    resource = models.CharField(max_length=30, choices=RESOURCE_CHOICES)
    description = models.TextField(blank=True)

    class Meta:
        unique_together = ("action", "resource")

    def __str__(self):
        return f"{self.action}:{self.resource}"


class Role(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    permissions = models.ManyToManyField(Permission, blank=True, related_name="roles")
    is_system = models.BooleanField(default=False)
    is_company_default = models.BooleanField(default=False)
    is_all = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class UserRole(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    company = models.ForeignKey(
        "accounts.Company", on_delete=models.CASCADE, null=True, blank=True, related_name="user_roles"
    )

    class Meta:
        unique_together = ("user", "role", "company")

    def __str__(self):
        return f"{self.user} -> {self.role}"


class AuditLog(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=50)
    resource_type = models.CharField(max_length=50, blank=True)
    resource_id = models.CharField(max_length=100, blank=True)
    detail = models.TextField(blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user"]), models.Index(fields=["created_at"])]

    def __str__(self):
        return f"{self.created_at.isoformat()} {self.user} {self.action}"