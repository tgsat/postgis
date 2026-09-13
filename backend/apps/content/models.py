import re

from django.db import models

from apps.accounts.models import Company, User


def sanitize_base(value):
    """UPPERCASE, spaces/special chars -> underscore, collapse & strip."""
    value = re.sub(r"[^A-Za-z0-9]+", "_", value)
    value = re.sub(r"_+", "_", value).strip("_")
    return value.upper()


def default_item_name(file_name):
    """Naming convention (docs 16.1): {NAME}_{ext}  e.g. UP3_TOLITOLI_gdb.

    Converts e.g. "UP3_Tolitoli.gdb.zip" -> "UP3_TOLITOLI_gdb",
    "jaringan_kabel.shp.zip" -> "JARINGAN_KABEL_shp". The final ".ext" of the
    real payload is kept as the source-extension suffix.
    """
    name = file_name
    lower = name.lower()
    if lower.endswith(".zip"):
        name = name[:-4]
    parts = name.rsplit(".", 1)
    if len(parts) == 2 and parts[1]:
        base = sanitize_base(parts[0])
        ext = sanitize_base(parts[1]).lower()
        return f"{base}_{ext}" if base else ext.upper()
    base = sanitize_base(parts[0])
    return base or "ITEM"


def unique_title(company, title):
    existing = set(
        Item.objects.filter(company=company, title__istartswith=title).values_list("title", flat=True)
    )
    if title not in existing:
        return title
    n = 1
    while f"{title}_{n}" in existing:
        n += 1
    return f"{title}_{n}"


def normalize_geom_type(raw):
    """Map ogrinfo geometry strings like '3D Multi Line String' to choices."""
    if not raw:
        return "Geometry"
    value = re.sub(r"\b3D\b", "", raw, flags=re.I).strip()
    value = value.replace("Line String", "LineString")
    value = value.replace("Multi Point", "MultiPoint")
    value = value.replace("Multi Polygon", "MultiPolygon")
    value = re.sub(r"\s+", "", value)
    mapping = {
        "Point": "Point",
        "MultiPoint": "MultiPoint",
        "LineString": "LineString",
        "MultiLineString": "MultiLineString",
        "Polygon": "Polygon",
        "MultiPolygon": "MultiPolygon",
    }
    return mapping.get(value, "Geometry")

ITEM_TYPE_CHOICES = [
    ("feature_layer", "Feature Layer"),
    ("web_map", "Web Map"),
    ("form", "Form"),
    ("dashboard", "Dashboard"),
]

SHARING_CHOICES = [
    ("private", "Private"),
    ("organization", "Organization"),
    ("public", "Public"),
]


class Item(models.Model):
    """Generic catalog item, equivalent of an ArcGIS Online "Item".

    A Feature Layer (Hosted) is a Dataset wrapped in an Item. A Web Map is a
    saved Map definition wrapped in an Item. sharing_level / delete_protection
    follow the Item Detail "Settings" tab spec.
    """

    item_type = models.CharField(max_length=30, choices=ITEM_TYPE_CHOICES, default="feature_layer")
    title = models.CharField(max_length=200)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="items")
    dataset = models.OneToOneField(
        "layers.Dataset", null=True, blank=True, on_delete=models.CASCADE, related_name="item"
    )
    map = models.OneToOneField(
        "projects.Map", null=True, blank=True, on_delete=models.CASCADE, related_name="item"
    )
    hosted = models.BooleanField(default=True)
    sharing_level = models.CharField(max_length=20, choices=SHARING_CHOICES, default="private")
    tags = models.JSONField(default=list, blank=True)
    delete_protection = models.BooleanField(default=False)
    owner = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name="items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({'hosted' if self.hosted else self.item_type})"


class ImportJob(models.Model):
    """Async "Add Data" job: upload -> analyze (preview) -> publish -> hosted item."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("analyzing", "Analyzing"),
        ("ready", "Ready for publish"),
        ("processing", "Importing"),
        ("success", "Successful"),
        ("failed", "Failed"),
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="import_jobs")
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500, blank=True)
    container_kind = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    format = models.CharField(max_length=20, blank=True)
    layers = models.JSONField(default=list, blank=True)
    config = models.JSONField(default=dict, blank=True)
    celery_task_id = models.CharField(max_length=128, blank=True)
    error = models.TextField(blank=True)
    item_ids = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"ImportJob #{self.pk} ({self.file_name}: {self.status})"