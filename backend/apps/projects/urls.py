from rest_framework.routers import DefaultRouter

from .views import MapViewSet, ProjectViewSet

router = DefaultRouter()
router.register("projects", ProjectViewSet, basename="project")
router.register("maps", MapViewSet, basename="map")

urlpatterns = router.urls