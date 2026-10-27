from pathlib import Path
import warnings
import re
from PIL import Image, UnidentifiedImageError

from rest_framework.exceptions import ValidationError

# =====================================================
# ALLOWED FILE FORMATS
# =====================================================

MAX_DOCUMENT_SIZE = 10 * 1024 * 1024  # 10 MiB

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}


# =====================================================
# FILE VALIDATION
# =====================================================


def validate_document_file(uploaded_file):
    """
    Validate a file before it is stored.

    This provides initial size and signature checks.
    Production deployment should also include
    malware scanning and stronger file inspection.
    """

    if uploaded_file is None:
        raise ValidationError({"file": "Choose a document to upload."})

    file_size = getattr(uploaded_file, "size", None)

    if file_size is None:
        raise ValidationError({"file": "Unable to determine file size."})

    if file_size <= 0:
        raise ValidationError({"file": "Empty files are not allowed."})

    if file_size > MAX_DOCUMENT_SIZE:
        raise ValidationError({"file": "Maximum file size is 10 MB."})

    original_filename = Path(str(uploaded_file.name).replace("\\", "/")).name

    if not original_filename or original_filename in {".", ".."}:
        raise ValidationError({"file": "Invalid document filename."})

    if any(ord(char) < 32 or ord(char) == 127 for char in original_filename):
        raise ValidationError({"file": "Invalid document filename."})

    if len(original_filename) > 255:
        raise ValidationError({"file": "Filename must be 255 characters or fewer."})

    extension = Path(original_filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            {
                "file": (
                    "Unsupported file format. "
                    "Only PDF, JPG, JPEG, PNG and WebP are allowed."
                )
            }
        )

    # Inspect bytes, never the browser-supplied Content-Type.
    mime_types = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    try:
        uploaded_file.seek(0)
        if extension == ".pdf":
            header = uploaded_file.read(8)
            uploaded_file.seek(max(0, file_size - 1024))
            tail = uploaded_file.read()
            if not re.match(rb"%PDF-[12]\.[0-9]", header) or b"%%EOF" not in tail:
                raise ValidationError({"file": "The PDF is invalid or incomplete."})
        else:
            expected = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}[extension]
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(uploaded_file) as image:
                    if image.format != expected:
                        raise ValidationError({"file": "File contents do not match the selected extension."})
                    image.verify()
                uploaded_file.seek(0)
                with Image.open(uploaded_file) as image:
                    image.load()
    except (OSError, ValueError, AttributeError, UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValidationError({"file": "The file is unreadable, malformed, or unsafe to process."})
    finally:
        try:
            uploaded_file.seek(0)
        except (OSError, ValueError, AttributeError):
            pass

    return {
        "original_filename": original_filename,
        "file_size": file_size,
        "content_type": mime_types[extension],
    }
