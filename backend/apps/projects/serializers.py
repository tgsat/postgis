from rest_framework import serializers

from apps.accounts.models import Membership
from apps.layers.models import Dataset

from .models import Map, MapLayer, Project


def scope_company(request):
    if request.user.is_system_admin:
        return None
    return Membership.objects.filter(user=request.user, is_primary=True).values_list("company_id", flat=True).first()


class ProjectSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Project
        fields = ["id", "company", "company_name", "name", "code", "description", "bbox", "created_at", "updated_at"]
        read_only_fields = ["created_at", "updated_at"]

    def validate_company(self, value):
        request = self.context.get("request")
        if request and not request.user.is_system_admin:
            company_id = scope_company(request)
            if not Membership.objects.filter(user=request.user, company=value).exists():
                raise serializers.ValidationError("No access to this company.")
        return value


class MapLayerSerializer(serializers.ModelSerializer):
    dataset_name = serializers.CharField(source="dataset.name", read_only=True)
    dataset_geom_type = serializers.CharField(source="dataset.geom_type", read_only=True)
    dataset_public = serializers.BooleanField(source="dataset.is_public", read_only=True)

    class Meta:
        model = MapLayer
        fields = ["id", "dataset", "dataset_name", "dataset_geom_type", "dataset_public", "order", "visible", "style"]
        extra_kwargs = {"order": {"default": 0}, "visible": {"default": True}}


class MapSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True)
    company = serializers.SerializerMethodField()
    layers = MapLayerSerializer(source="map_layers", many=True, read_only=True)
    datasets = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Dataset.objects.all(), required=False, write_only=True, source="datasets"
    )

    class Meta:
        model = Map
        fields = [
            "id", "project", "project_name", "company", "name", "description",
            "basemap", "initial_zoom", "initial_center", "is_public",
            "datasets", "layers", "created_at", "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def get_company(self, obj):
        return obj.project.company_id

    def validate_datasets(self, value):
        request = self.context.get("request")
        if not value:
            return value
        from apps.projects.serializers import scope_company

        allowed_qs = value.model.objects.all()
        if request and not request.user.is_system_admin:
            company_id = scope_company(request)
            allowed_qs = allowed_qs.filter(company_id=company_id)
        allowed = set(allowed_qs.values_list("pk", flat=True))
        if any(pk not in allowed for pk in value.values_list("pk", flat=True)):
            raise serializers.ValidationError("One or more datasets are outside your company scope.")
        return value

    def create(self, validated_data):
        datasets = validated_data.pop("datasets", [])
        map_obj = super().create(validated_data)
        for order, ds in enumerate(datasets):
            MapLayer.objects.create(map=map_obj, dataset=ds, order=order)
        return map_obj

    def update(self, instance, validated_data):
        datasets = validated_data.pop("datasets", None)
        map_obj = super().update(instance, validated_data)
        if datasets is not None:
            instance.datasets.clear()
            for order, ds in enumerate(datasets):
                MapLayer.objects.create(map=instance, dataset=ds, order=order)
        return map_obj