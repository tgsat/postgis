from django.contrib.gis.db import models

from apps.accounts.models import Company, User

GEOM_TYPE_CHOICES = [
    ("Point", "Point"),
    ("LineString", "LineString"),
    ("Polygon", "Polygon"),
    ("MultiPoint", "MultiPoint"),
    ("MultiLineString", "MultiLineString"),
    ("MultiPolygon", "MultiPolygon"),
    ("Geometry", "Any Geometry"),
]


class Dataset(models.Model):
    """Equivalent of an ArcGIS Hosted Feature Layer."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="datasets")
    project = models.ForeignKey(
        "projects.Project", null=True, blank=True, on_delete=models.SET_NULL, related_name="datasets"
    )
    name = models.CharField(max_length=150)
    table_name = models.CharField(max_length=63, unique=True)
    geom_type = models.CharField(max_length=30, choices=GEOM_TYPE_CHOICES, default="Geometry")
    srid = models.IntegerField(default=4326)
    schema = models.JSONField(default=dict)
    is_public = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["company", "project"])]

    def __str__(self):
        return self.name


class Feature(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.CASCADE, related_name="features")
    geom = models.GeometryField(srid=4326, null=True, blank=True)
    props = models.JSONField(default=dict)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["dataset"]), models.Index(fields=["dataset", "created_at"])]

    def __str__(self):
        return f"Feature #{self.pk} ({self.dataset.name})"


class Attachment(models.Model):
    feature = models.ForeignKey(Feature, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="attachments/%Y/%m/")
    kind = models.CharField(max_length=30, blank=True, default="file")
    caption = models.CharField(max_length=255, blank=True)
    size = models.BigIntegerField(default=0)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.file.name