from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CompanyViewSet, CurrentUserView, MembershipViewSet, UserViewSet

router = DefaultRouter()
router.register("memberships", MembershipViewSet, basename="membership")
router.register("companies", CompanyViewSet, basename="company")
router.register("", UserViewSet, basename="user")

urlpatterns = [path("me/", CurrentUserView.as_view(), name="current-user")]
urlpatterns += router.urls