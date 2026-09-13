from rest_framework.routers import DefaultRouter

from .views import FormViewSet, SubmissionViewSet

router = DefaultRouter()
router.register("forms", FormViewSet, basename="form")
router.register("submissions", SubmissionViewSet, basename="submission")

urlpatterns = router.urls