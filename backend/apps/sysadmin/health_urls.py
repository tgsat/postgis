from django.urls import path
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from django.db import connection


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    db_ok = True
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        db_ok = False
    return Response(
        {"status": "ok" if db_ok else "degraded", "database": "ok" if db_ok else "error"}
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def info(request):
    return Response(
        {
            "name": "GeoDash GIS Platform",
            "version": "1.0.0",
            "stack": "Django 5 + DRF + GeoDjango/PostGIS",
            "arcgis_credits_required": False,
        }
    )


urlpatterns = [
    path("", health_check, name="health"),
    path("info/", info, name="info"),
]