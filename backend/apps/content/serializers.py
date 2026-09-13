from rest_framework import serializers

from .models import ImportJob, Item


class ItemSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    owner_name = serializers.CharField(source="owner.username", read_only=True, default=None)
    display_title = serializers.SerializerMethodField()
    dataset_id = serializers.IntegerField(source="dataset.id", read_only=True, default=None)
    dataset_name = serializers.CharField(source="dataset.name", read_only=True, default=None)
    geom_type = serializers.CharField(source="dataset.geom_type", read_only=True, default=None)
    feature_count = serializers.SerializerMethodField()
    map_id = serializers.IntegerField(source="map.id", read_only=True, default=None)
    map_basemap = serializers.CharField(source="map.basemap", read_only=True, default=None)
    map_is_public = serializers.BooleanField(source="map.is_public", read_only=True, default=False)
    project_id = serializers.IntegerField(source="map.project_id", read_only=True, default=None)
    project_name = serializers.CharField(source="map.project.name", read_only=True, default=None)

    class Meta:
        model = Item
        fields = [
            "id", "item_type", "title", "display_title", "company", "company_name",
            "dataset_id", "dataset_name", "geom_type", "feature_count",
            "hosted", "sharing_level", "tags", "delete_protection",
            "owner", "owner_name",
            "map_id", "map_basemap", "map_is_public", "project_id", "project_name",
            "created_at", "updated_at",
        ]
        read_only_fields = ["hosted", "created_at", "updated_at", "company"]

    def get_display_title(self, obj):
        if obj.hosted and obj.item_type == "feature_layer":
            return f"{obj.title} (hosted)"
        return obj.title

    def get_feature_count(self, obj):
        if not obj.dataset_id:
            return None
        return obj.dataset.features.count()


class ImportJobSerializer(serializers.ModelSerializer):
    class Meta:
        model = ImportJob
        fields = [
            "id", "file_name", "container_kind", "status", "format",
            "layers", "config", "error", "item_ids", "created_at", "finished_at",
        ]
        read_only_fields = fields


class ItemFieldsSerializer(serializers.Serializer):
    """Fields metadata + coded-value domains for the Item Detail "Data" tab."""

    fields = serializers.JSONField(default=list)   # [{name,label,type,length,default,required,domain}]

    def validate_fields(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("fields must be a list.")
        for field in value:
            if not isinstance(field, dict) or not field.get("name"):
                raise serializers.ValidationError("each field requires a name.")
        return value