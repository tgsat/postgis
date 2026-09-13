from rest_framework import viewsets

from apps.rbac.audit import audit
from apps.rbac.permissions import InCompanyScope, IsSystemAdmin, IsSystemOrCompanyAdmin

from .models import Map, Project
from .serializers import MapSerializer, ProjectSerializer, scope_company


class BaseScopedViewSet(viewsets.ModelViewSet):
    permission_classes = [IsSystemOrCompanyAdmin, InCompanyScope]

    def get_queryset(self):
        company_id = scope_company(self.request)
        if company_id is None:
            return self.model.objects.all()
        return self.model.objects.filter(company_id=company_id)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        audit(self.request, "CREATE", self.model.__name__.lower(), str(serializer.instance.pk))

    def perform_update(self, serializer):
        serializer.save()
        audit(self.request, "UPDATE", self.model.__name__.lower(), str(serializer.instance.pk))

    def perform_destroy(self, instance):
        audit(self.request, "DELETE", self.model.__name__.lower(), str(instance.pk), str(instance))
        instance.delete()


class ProjectViewSet(BaseScopedViewSet):
    model = Project
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    search_fields = ["name", "code", "description"]
    filterset_fields = ["company"]


class MapViewSet(BaseScopedViewSet):
    model = Map
    queryset = Map.objects.all()
    serializer_class = MapSerializer
    search_fields = ["name", "description"]
    filterset_fields = ["project", "basemap", "is_public"]

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.select_related("project").prefetch_related("map_layers__dataset")