from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/v1/setup/", include("apps.accounts.setup_urls")),
    path("api/v1/auth/", include("apps.accounts.auth_urls")),
    path("api/v1/users/", include("apps.accounts.urls")),
    path("api/v1/rbac/", include("apps.rbac.urls")),
    path("api/v1/public/", include("apps.projects.public_urls")),
    path("api/v1/", include("apps.projects.urls")),
    path("api/v1/", include("apps.layers.urls")),
    path("api/v1/", include("apps.content.urls")),
    path("api/v1/forms/", include("apps.formsurvey.urls")),
    path("api/v1/dashboards/", include("apps.dashboard.urls")),
    path("api/v1/system/", include("apps.sysadmin.urls_api")),
    path("api/v1/health/", include("apps.sysadmin.health_urls")),
]