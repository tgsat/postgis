from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DashboardViewSet, platform_dashboard

router = DefaultRouter()
router.register("", DashboardViewSet, basename="dashboard")

urlpatterns = router.urls
urlpatterns.append(path("platform/stats/", platform_dashboard, name="platform-dashboard"))