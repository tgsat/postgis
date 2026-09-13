from rest_framework import serializers

from apps.accounts.models import Company, Membership, User, generate_org_id


class MembershipSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "user", "company", "company_name", "role", "is_primary", "joined_at"]

    def create(self, validated_data):
        membership = Membership.objects.create(**validated_data)
        self._grant_user_role(membership)
        return membership

    def update(self, instance, validated_data):
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        self._sync_user_role(instance)
        return instance

    @staticmethod
    def _role_for_type(role_type):
        from apps.rbac.models import Role

        if not role_type:
            return None
        label = dict(User.ROLE_CHOICES).get(role_type, "")
        return Role.objects.filter(name=label).first() or Role.objects.filter(name=role_type).first()

    def _grant_user_role(self, membership):
        from apps.rbac.models import UserRole

        role = self._role_for_type(membership.role)
        if role:
            UserRole.objects.get_or_create(user=membership.user, role=role, company=membership.company)

    def _sync_user_role(self, instance):
        from apps.rbac.models import UserRole

        role = self._role_for_type(instance.role)
        UserRole.objects.filter(user=instance.user, role__name__in=[name for _, name in User.ROLE_CHOICES]).delete()
        if role:
            UserRole.objects.create(user=instance.user, role=role, company=instance.company)


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            "id", "username", "email", "password", "first_name", "last_name", "full_name",
            "phone", "role_type", "is_system_admin", "is_active", "is_staff",
            "is_superuser", "date_joined", "created_at",
        ]
        read_only_fields = ["is_system_admin", "is_superuser", "is_staff", "date_joined", "created_at"]

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class CompanySerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(source="members.count", read_only=True)
    org_id = serializers.CharField(required=False, allow_blank=True, max_length=10)

    class Meta:
        model = Company
        fields = ["id", "org_id", "name", "code", "description", "created_at", "member_count"]
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True, "allow_null": True},
        }

    def validate_org_id(self, value):
        if not value:
            return None
        if len(value) != 10 or not all(c.isalnum() for c in value):
            raise serializers.ValidationError("Org ID must be 10 alphanumeric characters.")
        if Company.objects.filter(org_id=value).exists():
            return None
        return value

    def validate_code(self, value):
        return value or None

    def create(self, validated_data):
        org_id = validated_data.pop("org_id", None)
        if not org_id:
            org_id = generate_org_id()
        return Company.objects.create(org_id=org_id, **validated_data)

    def update(self, instance, validated_data):
        validated_data.pop("org_id", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance


class CompanyMembershipSerializer(serializers.ModelSerializer):
    company_id = serializers.IntegerField(source="company.id", read_only=True)
    company = serializers.CharField(source="company.name", read_only=True)
    role = serializers.SerializerMethodField()

    class Meta:
        model = Membership
        fields = ["id", "company_id", "company", "role", "is_primary"]

    def get_role(self, obj):
        return obj.role or obj.user.role_type