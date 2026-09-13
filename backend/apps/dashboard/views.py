from django.db.models import Count, Sum
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import Company, User
from apps.formsurvey.models import Form
from apps.layers.models import Attachment, Dataset, Feature
from apps.projects.models import Project
from apps.projects.serializers import scope_company
from apps.rbac.audit import audit
from apps.rbac.permissions import InCompanyScope, IsSystemOrCompanyAdmin

from .models import Dashboard
from .serializers import DashboardSerializer


class DashboardViewSet(viewsets.ModelViewSet):
    serializer_class = DashboardSerializer
    permission_classes = [IsSystemOrCompanyAdmin, InCompanyScope]

    def get_queryset(self):
        company_id = scope_company(self.request)
        if company_id is None:
            return Dashboard.objects.all()
        return Dashboard.objects.filter(company_id=company_id)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        audit(self.request, "CREATE", "dashboard", str(serializer.instance.pk), f'Created dashboard "{serializer.instance.name}"')

    def perform_update(self, serializer):
        serializer.save()
        audit(self.request, "UPDATE", "dashboard", str(serializer.instance.pk), f'Updated dashboard "{serializer.instance.name}"')

    def perform_destroy(self, instance):
        audit(self.request, "DELETE", "dashboard", str(instance.pk), f'Deleted dashboard "{instance.name}"')
        instance.delete()


def _global_stats():
    return {
        "users": User.objects.count(),
        "companies": Company.objects.count(),
        "projects": Project.objects.count(),
        "datasets": Dataset.objects.count(),
        "features": Feature.objects.count(),
        "attachments": Attachment.objects.count(),
        "storage_bytes": Attachment.objects.aggregate(total=Sum("size"))["total"] or 0,
        "forms": Form.objects.count(),
    }


def _company_stats(user):
    company_id = scope_company(user)
    qs = Feature.objects.filter(dataset__company_id=company_id) if company_id else Feature.objects.all()
    return {
        "users": User.objects.filter(memberships__company_id=company_id).distinct().count() if company_id else 0,
        "projects": Project.objects.filter(company_id=company_id).count() if company_id else 0,
        "datasets": Dataset.objects.filter(company_id=company_id).count(),
        "features": qs.count(),
        "storage_bytes": Attachment.objects.filter(feature__dataset__company_id=company_id)
        .aggregate(total=Sum("size"))["total"]
        or 0,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def platform_dashboard(request):
    if request.user.is_system_admin:
        return Response({"scope": "global", "stats": _global_stats()})
    return Response({"scope": "company", "stats": _company_stats(request.user)})