from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.rbac.audit import audit


class AuditedTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            from django.contrib.auth import authenticate

            user = authenticate(
                request,
                username=request.data.get("username", ""),
                password=request.data.get("password", ""),
            )
            audit(
                request,
                "LOGIN",
                "auth",
                str(user.pk) if user else "",
                "User login" if user else "Failed login attempt",
                user=user,
            )
        return response


urlpatterns = [
    path("login/", AuditedTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]