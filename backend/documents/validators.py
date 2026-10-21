from pathlib import Path

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

    if len(original_filename) > 255:
        raise ValidationError({"file": "Filename must be 255 characters or fewer."})

    extension = Path(original_filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError(
            {
                "file": (
                    "Unsupported file format. "
                    "Only PDF, JPG, JPEG and PNG are allowed."
                )
            }
        )

    # Do not trust the client-supplied Content-Type.
    # Inspect the initial file bytes.
    try:
        uploaded_file.seek(0)
        header = uploaded_file.read(16)
    except (OSError, ValueError, AttributeError):
        raise ValidationError({"file": "Unable to read the uploaded file."})
    finally:
        try:
            uploaded_file.seek(0)
        except (OSError, ValueError, AttributeError):
            pass

    if extension == ".pdf":
        valid_signature = header.startswith(b"%PDF-")

    elif extension in {".jpg", ".jpeg"}:
        valid_signature = header.startswith(b"\xff\xd8\xff")

    elif extension == ".png":
        valid_signature = header.startswith(b"\x89PNG\r\n\x1a\n")

    else:
        valid_signature = False

    if not valid_signature:
        raise ValidationError(
            {"file": ("File contents do not match " "the selected file extension.")}
        )

    return {
        "original_filename": original_filename,
        "file_size": file_size,
    }
