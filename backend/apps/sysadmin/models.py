from django.core.cache import cache
from django.db import models


class SystemSetting(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField(blank=True)
    value_type = models.CharField(max_length=20, default="str")
    description = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.key}={self.value}"

    @classmethod
    def get(cls, key, default=None):
        cached = cache.get(key)
        if cached is not None:
            return cached
        setting = cls.objects.filter(key=key).first()
        value = setting.value if setting else default
        cache.set(key, value, 300)
        return value

    @classmethod
    def get_bool(cls, key, default=False):
        value = cls.get(key, None)
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("1", "true", "yes", "on")

    @classmethod
    def set(cls, key, value, value_type="str", description=""):
        obj, _ = cls.objects.update_or_create(
            key=key, defaults={"value": str(value), "value_type": value_type, "description": description}
        )
        cache.set(key, str(value), 300)
        return obj


class BackupJob(models.Model):
    STATUS_CHOICES = [("running", "Running"), ("success", "Success"), ("failed", "Failed")]
    name = models.CharField(max_length=150, default="backup")
    file_path = models.CharField(max_length=500, blank=True)
    size_bytes = models.BigIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="running")
    error = models.TextField(blank=True)
    created_by = models.ForeignKey(
        "accounts.User", null=True, blank=True, on_delete=models.SET_NULL
    )
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return self.name


class StorageUsage(models.Model):
    """Snapshot of storage & database usage."""

    scope_type = models.CharField(max_length=20, default="global")
    company = models.ForeignKey("accounts.Company", null=True, blank=True, on_delete=models.CASCADE)
    storage_bytes = models.BigIntegerField(default=0)
    attachment_count = models.BigIntegerField(default=0)
    database_bytes = models.BigIntegerField(default=0)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"{self.scope_type} @ {self.recorded_at.isoformat()}"