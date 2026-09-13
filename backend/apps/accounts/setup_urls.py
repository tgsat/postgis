from django.urls import re_path
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.sysadmin.models import SystemSetting


@api_view(["GET"])
@permission_classes([AllowAny])
def setup_status(request):
    initialized = SystemSetting.get_bool("SYSTEM_INITIALIZED", default=False)
    return Response({"system_initialized": initialized})


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_init_token(request):
    token = request.data.get("token", "")
    stored = SystemSetting.get("INITIAL_PASSWORD_HASH", default="")
    if not stored:
        return Response({"valid": False}, status=status.HTTP_400_BAD_REQUEST)
    from django.contrib.auth.hashers import check_password

    valid = check_password(token, stored)
    return Response({"valid": valid})


@api_view(["POST"])
@permission_classes([AllowAny])
def initialize(request):
    from apps.sysadmin.init_service import initialize_platform
    from apps.sysadmin.models import SystemSetting

    if SystemSetting.get_bool("SYSTEM_INITIALIZED", default=False):
        return Response(
            {"detail": "System is already initialized."}, status=status.HTTP_400_BAD_REQUEST
        )
    name = request.data.get("name", "")
    username = request.data.get("username", "")
    email = request.data.get("email", "")
    password = request.data.get("password", "")
    if not all([username, email, password]):
        return Response({"detail": "Username, email and password are required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        admin, _ = initialize_platform(name=name, username=username, email=email, password=password)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    from apps.rbac.audit import audit

    audit(request, "CREATE", "system", str(admin.pk), "System initialized with first System Administrator", user=admin)
    return Response({"status": "initialized", "admin_username": admin.username})


urlpatterns = [
    re_path(r"^status/?$", setup_status, name="setup-status"),
    re_path(r"^initialize/?$", initialize, name="setup-initialize"),
    re_path(r"^verify/?$", verify_init_token, name="verify-init-token"),
]