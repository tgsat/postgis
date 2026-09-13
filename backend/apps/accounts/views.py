from rest_framework import generics, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Company, Membership, User, generate_org_id
from apps.rbac.audit import audit
from apps.rbac.permissions import InCompanyScope, IsSystemAdmin, IsSystemOrCompanyAdmin

from .serializers import (
    CompanyMembershipSerializer,
    CompanySerializer,
    MembershipSerializer,
    UserSerializer,
)


class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserSerializer
    permission_classes = [IsSystemOrCompanyAdmin]
    search_fields = ["username", "email", "first_name", "last_name"]

    def get_queryset(self):
        user = self.request.user
        if user.is_system_admin:
            return User.objects.all().order_by("-created_at")
        member_companies = Membership.objects.filter(user=user).values_list("company_id", flat=True)
        return (
            User.objects.filter(memberships__company_id__in=list(member_companies))
            .distinct()
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        serializer.save(
            **(
                {"is_staff": True}
                if self.request.user.is_system_admin and serializer.validated_data.get("role_type") == "system_admin"
                else {}
            )
        )
        audit(self.request, "CREATE", "user", str(serializer.instance.pk), f'Created user "{serializer.instance.username}"')

    def perform_update(self, serializer):
        serializer.save()
        audit(self.request, "UPDATE", "user", str(serializer.instance.pk), f'Updated user "{serializer.instance.username}"')

    def perform_destroy(self, instance):
        audit(self.request, "DELETE", "user", str(instance.pk), f'Deleted user "{instance.username}"')
        instance.delete()


class CompanyViewSet(viewsets.ModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer
    permission_classes = [IsSystemAdmin]
    search_fields = ["name", "code", "org_id"]

    @action(detail=False, methods=["get"], url_path="org-id-preview")
    def org_id_preview(self, request):
        return Response({"org_id": generate_org_id()})

    def perform_create(self, serializer):
        serializer.save()
        audit(self.request, "CREATE", "company", str(serializer.instance.pk), f'Created organization "{serializer.instance.name}"')

    def perform_update(self, serializer):
        serializer.save()
        audit(self.request, "UPDATE", "company", str(serializer.instance.pk), f'Updated organization "{serializer.instance.name}"')

    def perform_destroy(self, instance):
        audit(self.request, "DELETE", "company", str(instance.pk), f'Deleted organization "{instance.name}"')
        instance.delete()


class MembershipViewSet(viewsets.ModelViewSet):
    queryset = Membership.objects.all()
    serializer_class = MembershipSerializer
    permission_classes = [IsSystemOrCompanyAdmin, InCompanyScope]

    def get_queryset(self):
        user = self.request.user
        if user.is_system_admin:
            return Membership.objects.all()
        member_companies = Membership.objects.filter(user=user).values_list("company_id", flat=True)
        return Membership.objects.filter(company_id__in=list(member_companies))

    def perform_create(self, serializer):
        serializer.save()
        audit(
            self.request,
            "CREATE",
            "membership",
            str(serializer.instance.pk),
            f'Added {serializer.instance.user.username} to "{serializer.instance.company.name}"',
        )

    def perform_update(self, serializer):
        serializer.save()
        audit(self.request, "UPDATE", "membership", str(serializer.instance.pk), "Updated membership")

    def perform_destroy(self, instance):
        audit(
            self.request,
            "DELETE",
            "membership",
            str(instance.pk),
            f'Removed {instance.user.username} from "{instance.company.name}"',
        )
        from apps.rbac.models import UserRole

        UserRole.objects.filter(user=instance.user, company=instance.company).delete()
        instance.delete()


class CurrentUserView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get(self, request, *args, **kwargs):
        serializer = UserSerializer(request.user, context={"request": request})
        memberships = CompanyMembershipSerializer(
            request.user.membership_set.select_related("company").all(), many=True
        ).data
        return Response({**serializer.data, "memberships": memberships})