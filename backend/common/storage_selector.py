from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

from common.cloudinary_storage import PrivateCloudinaryStorage


@deconstructible
class SelectablePrivateStorage(Storage):
    """
    Select a storage backend without changing FileField models.

    local      -> private filesystem storage
    cloudinary -> authenticated Cloudinary storage
    """

    def __init__(self, local_root_setting):
        self.local_root_setting = local_root_setting
        self._backend = None
        self._backend_provider = None

    def _get_backend(self):
        provider = getattr(settings, "STORAGE_PROVIDER", "local").lower()

        if self._backend is None or self._backend_provider != provider:
            self._backend_provider = provider

            if provider == "local":
                from django.core.files.storage import FileSystemStorage

                self._backend = FileSystemStorage(
                    location=getattr(settings, self.local_root_setting),
                    base_url=None,
                )

            elif provider == "cloudinary":
                self._backend = PrivateCloudinaryStorage()

            else:
                raise ImproperlyConfigured(f"Unsupported storage provider: {provider}")

        return self._backend

    def _open(self, name, mode="rb"):
        return self._get_backend().open(name, mode)

    def _save(self, name, content):
        return self._get_backend().save(name, content)

    def exists(self, name):
        return self._get_backend().exists(name)

    def delete(self, name):
        return self._get_backend().delete(name)

    def size(self, name):
        return self._get_backend().size(name)

    def url(self, name):
        raise ValueError("Private files do not have public URLs.")
