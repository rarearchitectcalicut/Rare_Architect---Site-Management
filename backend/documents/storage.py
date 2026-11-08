import uuid
from pathlib import Path

from django.utils.deconstruct import deconstructible

from common.storage_selector import SelectablePrivateStorage


@deconstructible
class PrivateDocumentStorage(SelectablePrivateStorage):
    def __init__(self):
        super().__init__("PRIVATE_DOCUMENT_ROOT")


private_document_storage = PrivateDocumentStorage()


def document_upload_path(instance, filename):
    extension = Path(filename).suffix.lower()
    random_filename = f"{uuid.uuid4().hex}{extension}"

    document_kind = (
        "projects" if instance._meta.model_name == "projectdocumentversion" else "tasks"
    )

    return f"{document_kind}/{instance.document_id}/{random_filename}"
