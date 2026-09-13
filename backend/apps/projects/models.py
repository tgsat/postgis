from django.contrib.gis.db import models

from apps.accounts.models import Company, User

BASEMAP_CHOICES = [
    ("osm", "OpenStreetMap"),
    ("carto_light", "CartoDB Light"),
    ("carto_dark", "CartoDB Dark"),
    ("satellite", "Satellite"),
]


class Project(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=150)
    code = models.SlugField(max_length=100, blank=True)
    description = models.TextField(blank=True)
    bbox = models.PolygonField(srid=4326, null=True, blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("company", "name")

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = self.name.lower().replace(" ", "-")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.company.name} / {self.name}"


class Map(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="maps")
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    basemap = models.CharField(max_length=30, choices=BASEMAP_CHOICES, default="osm")
    initial_zoom = models.SmallIntegerField(default=4)
    initial_center = models.PointField(srid=4326, null=True, blank=True)
    is_public = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    datasets = models.ManyToManyField(
        "layers.Dataset", through="MapLayer", related_name="maps", blank=True
    )

    def __str__(self):
        return self.name


class MapLayer(models.Model):
    """Link between a Map and the Datasets rendered on it (layer stack of the map)."""

    map = models.ForeignKey(Map, on_delete=models.CASCADE, related_name="map_layers")
    dataset = models.ForeignKey("layers.Dataset", on_delete=models.CASCADE, related_name="map_links")
    order = models.PositiveIntegerField(default=0)
    visible = models.BooleanField(default=True)
    style = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["order", "id"]
        unique_together = ("map", "dataset")

    def __str__(self):
        return f"{self.map.name} :: {self.dataset.name}"