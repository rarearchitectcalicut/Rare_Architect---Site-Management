import os
import uuid
from pathlib import PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import cloudinary
import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
from cloudinary.exceptions import Error, NotFound

from django.core.exceptions import SuspiciousFileOperation
from django.core.files.base import ContentFile
from django.core.files.storage import Storage
from django.utils.deconstruct import deconstructible

MAX_PRIVATE_FILE_SIZE = 10 * 1024 * 1024


@deconstructible
class PrivateCloudinaryStorage(Storage):
    """
    Store private files as authenticated Cloudinary raw assets.

    File access must go through authorized Django views.
    Public storage URLs are not exposed.
    """

    def _configure(self):
        cloudinary.config(
            cloud_name=os.environ["CLOUDINARY_CLOUD_NAME"],
            api_key=os.environ["CLOUDINARY_API_KEY"],
            api_secret=os.environ["CLOUDINARY_API_SECRET"],
            secure=True,
        )

    def get_available_name(self, name, max_length=None):
        """
        Generate a new storage name for each upload.

        Keep the original directory and extension.
        """
        path = PurePosixPath(name.replace("\\", "/"))

        if path.is_absolute() or ".." in path.parts:
            raise SuspiciousFileOperation("Invalid private storage path.")

        unique_name = f"{path.stem}-{uuid.uuid4().hex}{path.suffix}"

        result = (
            str(path.parent / unique_name) if str(path.parent) != "." else unique_name
        )

        if max_length is not None and len(result) > max_length:
            raise SuspiciousFileOperation("Private storage filename is too long.")

        return result

    def _save(self, name, content):
        self._configure()

        if content.size > MAX_PRIVATE_FILE_SIZE:
            raise ValueError("Private file exceeds size limit.")

        content.seek(0)

        try:
            result = cloudinary.uploader.upload(
                content,
                public_id=name,
                resource_type="raw",
                type="authenticated",
                overwrite=False,
            )
        except Error as exc:
            raise OSError("Private file upload failed.") from exc

        saved_name = result.get("public_id")

        if not saved_name:
            raise OSError("Cloud storage returned no file identifier.")

        # Do not silently accept a different stored asset.
        if saved_name != name:
            raise OSError("Cloud storage returned an unexpected filename.")

        return saved_name

    def _open(self, name, mode="rb"):
        if mode != "rb":
            raise ValueError("Private storage supports binary reads only.")

        self._configure()

        url = cloudinary.utils.private_download_url(
            name,
            None,
            resource_type="raw",
            type="authenticated",
        )

        try:
            with urlopen(url, timeout=30) as response:
                data = response.read(MAX_PRIVATE_FILE_SIZE + 1)

        except HTTPError as exc:
            if exc.code == 404:
                raise FileNotFoundError("Private file not found.") from exc

            raise OSError("Private file download failed.") from exc

        except (URLError, TimeoutError) as exc:
            raise OSError("Private file download is unavailable.") from exc

        if len(data) > MAX_PRIVATE_FILE_SIZE:
            raise OSError("Private file exceeds download size limit.")

        return ContentFile(data, name=name)

    def exists(self, name):
        self._configure()

        try:
            cloudinary.api.resource(
                name,
                resource_type="raw",
                type="authenticated",
            )
            return True

        except NotFound:
            return False

        except Error as exc:
            raise OSError("Unable to check private file.") from exc

    def size(self, name):
        self._configure()

        try:
            result = cloudinary.api.resource(
                name,
                resource_type="raw",
                type="authenticated",
            )
            return result["bytes"]

        except NotFound as exc:
            raise FileNotFoundError("Private file not found.") from exc

        except Error as exc:
            raise OSError("Unable to retrieve private file size.") from exc

    def delete(self, name):
        if not name:
            return

        self._configure()

        try:
            result = cloudinary.uploader.destroy(
                name,
                resource_type="raw",
                type="authenticated",
            )
        except Error as exc:
            raise OSError("Private file deletion failed.") from exc

        if result.get("result") not in ("ok", "not found"):
            raise OSError("Private file deletion was not confirmed.")

    def url(self, name):
        raise ValueError("Private files do not have public URLs.")
