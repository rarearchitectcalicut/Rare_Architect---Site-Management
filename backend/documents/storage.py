import uuid

from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible

# =====================================================
# PRIVATE DOCUMENT STORAGE
# =====================================================


@deconstructible
class PrivateDocumentStorage(FileSystemStorage):
    """
    Store document files outside publicly
    served media directories.

    Access to these files will be provided
    only through authorized API download views.
    """

    def __init__(self):
        super().__init__(
            location=settings.PRIVATE_DOCUMENT_ROOT,
            base_url=None,
        )

    def url(self, name):
        raise ValueError("Private documents do not have public URLs.")


private_document_storage = PrivateDocumentStorage()


# =====================================================
# RANDOM DOCUMENT FILE PATH
# =====================================================


def document_upload_path(instance, filename):
    """
    Generate a random storage filename.

    Never trust or reuse the original filename
    as the actual stored filename.
    """

    extension = Path(filename).suffix.lower()

    random_filename = f"{uuid.uuid4().hex}{extension}"

    document_kind = (
        "projects" if instance._meta.model_name == "projectdocumentversion" else "tasks"
    )

    return f"{document_kind}/" f"{instance.document_id}/" f"{random_filename}"
