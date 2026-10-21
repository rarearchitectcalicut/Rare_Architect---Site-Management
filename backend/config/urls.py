from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("users.urls")),
    path("api/v1/", include("projects.urls")),
    path("api/v1/", include("tasks.urls")),
    path("api/v1/", include("reports.urls")),
    path("api/v1/", include("notifications.urls")),
    path("api/v1/", include("documents.urls")),
    path("api/v1/", include("activity.urls")),
]


if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
