from django.db import models

from apps.accounts.models import Company, User


class Dashboard(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="dashboards")
    name = models.CharField(max_length=150)
    config = models.JSONField(default=list)
    is_public = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class DashboardStats(models.Model):
    """Cached / aggregated stats shown on the admin dashboard."""

    company = models.OneToOneField(Company, null=True, blank=True, on_delete=models.CASCADE)
    is_global = models.BooleanField(default=False)
    user_count = models.IntegerField(default=0)
    company_count = models.IntegerField(default=0)
    project_count = models.IntegerField(default=0)
    layer_count = models.IntegerField(default=0)
    feature_count = models.BigIntegerField(default=0)
    storage_bytes = models.BigIntegerField(default=0)
    database_bytes = models.BigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "dashboard stats"

    def __str__(self):
        return "Global" if self.is_global else self.company.name