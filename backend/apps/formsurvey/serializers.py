from rest_framework import serializers

from apps.projects.serializers import scope_company

from .models import Form, Submission


class GeoJSONPointField(serializers.Field):
    """Accepts GeoJSON Point on input, returns GeoJSON geometry on output."""

    def to_representation(self, value):
        return value.geojson if value else None

    def to_internal_value(self, data):
        if not data:
            return None
        if not isinstance(data, dict):
            raise serializers.ValidationError("location must be a GeoJSON Point object.")
        import json

        from django.contrib.gis.geos import GEOSGeometry

        geom = GEOSGeometry(json.dumps(data), srid=4326)
        if geom.srid and geom.srid != 4326:
            geom.transform(4326)
        if geom.geom_type != "Point":
            raise serializers.ValidationError("location must be of type Point.")
        return geom


class FormSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    submission_count = serializers.IntegerField(source="submissions.count", read_only=True)

    class Meta:
        model = Form
        fields = [
            "id", "company", "company_name", "project", "name", "description",
            "schema", "target_dataset", "is_active", "submission_count", "created_at", "updated_at",
        ]

    def validate_company(self, value):
        request = self.context.get("request")
        if request and not request.user.is_system_admin:
            company_id = scope_company(request)
            if company_id is None or company_id != value.id:
                raise serializers.ValidationError("No access to this company.")
        return value


class SubmissionSerializer(serializers.ModelSerializer):
    form_name = serializers.CharField(source="form.name", read_only=True)
    location = GeoJSONPointField(required=False, allow_null=True)

    class Meta:
        model = Submission
        fields = [
            "id", "form", "form_name", "data", "location", "feature",
            "is_synced", "client_id", "created_at", "updated_at",
        ]

    def _materialize_feature(self, submission):
        """Write the submission to its target_dataset as a PostGIS Feature (sync)."""
        from apps.layers.models import Feature

        target = submission.form.target_dataset
        if not target or submission.location is None:
            submission.is_synced = False
            submission.save(update_fields=["is_synced"])
            return submission
        feature, created = Feature.objects.get_or_create(
            dataset=target,
            geom=submission.location,
            props={
                **submission.data,
                "submission_id": submission.pk,
                "form": submission.form.name,
            },
            defaults={"created_by": submission.submitted_by},
        )
        submission.feature = feature
        submission.is_synced = True
        submission.save(update_fields=["feature", "is_synced"])
        if created:
            from apps.rbac.audit import audit

            request = self.context.get("request")
            if request:
                audit(
                    request,
                    "CREATE",
                    "feature",
                    str(feature.pk),
                    f'Submission #{submission.pk} of form "{submission.form.name}" synced to dataset "{target.name}"',
                )
        return submission

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data["submitted_by"] = request.user if request and request.user.is_authenticated else None

        form = validated_data.get("form")
        client_id = validated_data.get("client_id", "")
        if form and client_id:
            existing = Submission.objects.filter(form=form, client_id=client_id).first()
            if existing:
                for key in ("data", "location"):
                    if key in validated_data:
                        setattr(existing, key, validated_data[key])
                existing.save(update_fields=["data", "location"])
                return self._materialize_feature(existing)

        submission = super().create(validated_data)
        return self._materialize_feature(submission)