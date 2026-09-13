from rest_framework.routers import DefaultRouter

from .views import ImportJobViewSet, ItemViewSet

router = DefaultRouter()
router.register("items", ItemViewSet, basename="item")
router.register("upload-jobs", ImportJobViewSet, basename="import-job")

urlpatterns = router.urls