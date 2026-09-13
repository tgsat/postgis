from django.contrib.gis.db import models

from apps.accounts.models import Company, User
from apps.projects.models import Project


class Form(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="forms")
    project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.SET_NULL, related_name="forms")
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    schema = models.JSONField(default=list)
    target_dataset = models.ForeignKey(
        "layers.Dataset", null=True, blank=True, on_delete=models.SET_NULL, related_name="forms"
    )
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Submission(models.Model):
    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="submissions")
    data = models.JSONField(default=dict)
    location = models.PointField(srid=4326, null=True, blank=True)
    feature = models.ForeignKey("layers.Feature", null=True, blank=True, on_delete=models.SET_NULL)
    submitted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    is_synced = models.BooleanField(default=False)
    client_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Submission #{self.pk} ({self.form.name})"