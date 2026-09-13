from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BackupJobViewSet,
    StorageUsageViewSet,
    SystemSettingViewSet,
    database_info_view,
    storage_listing,
)

router = DefaultRouter()
router.register("settings", SystemSettingViewSet, basename="setting")
router.register("backups", BackupJobViewSet, basename="backup")
router.register("storage-usage", StorageUsageViewSet, basename="storage-usage")

urlpatterns = [
    path("database/", database_info_view, name="database-info"),
    path("storage/", storage_listing, name="storage-listing"),
    *router.urls,
]