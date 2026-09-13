from rest_framework.routers import DefaultRouter

from .views import AttachmentViewSet, DatasetViewSet, FeatureViewSet

router = DefaultRouter()
router.register("datasets", DatasetViewSet, basename="dataset")
router.register("features", FeatureViewSet, basename="feature")
router.register("attachments", AttachmentViewSet, basename="attachment")

urlpatterns = router.urls