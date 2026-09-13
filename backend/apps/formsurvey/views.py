from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.projects.serializers import scope_company
from apps.rbac.permissions import InCompanyScope, IsSystemOrCompanyAdmin

from .models import Form, Submission
from .serializers import FormSerializer, SubmissionSerializer


class FormViewSet(viewsets.ModelViewSet):
    serializer_class = FormSerializer
    permission_classes = [IsSystemOrCompanyAdmin, InCompanyScope]
    search_fields = ["name", "description"]
    filterset_fields = ["company", "project", "is_active"]

    def get_queryset(self):
        company_id = scope_company(self.request)
        if company_id is None:
            return Form.objects.all()
        return Form.objects.filter(company_id=company_id)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
        from apps.rbac.audit import audit

        audit(self.request, "CREATE", "form", str(serializer.instance.pk), f'Created form "{serializer.instance.name}"')

    def perform_update(self, serializer):
        serializer.save()
        from apps.rbac.audit import audit

        audit(self.request, "UPDATE", "form", str(serializer.instance.pk), f'Updated form "{serializer.instance.name}"')

    def perform_destroy(self, instance):
        from apps.rbac.audit import audit

        audit(self.request, "DELETE", "form", str(instance.pk), f'Deleted form "{instance.name}"')
        instance.delete()


class SubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionSerializer
    permission_classes = [IsAuthenticated, InCompanyScope]
    filterset_fields = ["form", "is_synced", "feature"]
    search_fields = ["data"]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "destroy"):
            self.permission_classes = [IsSystemOrCompanyAdmin, InCompanyScope]
        return super().get_permissions()

    def get_queryset(self):
        company_id = scope_company(self.request)
        if company_id is None:
            return Submission.objects.all()
        return Submission.objects.filter(form__company_id=company_id)

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def perform_create(self, serializer):
        serializer.save()
        from apps.rbac.audit import audit

        audit(self.request, "CREATE", "form", str(serializer.instance.form_id), f'Submission #{serializer.instance.pk} received (form "{serializer.instance.form.name}")')

    def perform_update(self, serializer):
        serializer.save()
        from apps.rbac.audit import audit

        audit(self.request, "UPDATE", "form", str(serializer.instance.form_id), f'Submission #{serializer.instance.pk} updated')

    def perform_destroy(self, instance):
        from apps.rbac.audit import audit

        audit(self.request, "DELETE", "form", str(instance.form_id), f'Submission #{instance.pk} deleted')
        instance.delete()