from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

SUPPORTED_FORMATS = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}

MAX_IMAGE_DIMENSION = 1920
JPEG_QUALITY = 85
WEBP_QUALITY = 85


def compress_image(uploaded_file):
    """
    Compress supported images without changing their format.

    Returns the original uploaded file if compression
    is unnecessary or does not reduce file size.

    Run existing upload validation before calling.
    """
    extension = Path(uploaded_file.name).suffix.lower()

    if extension not in SUPPORTED_FORMATS:
        uploaded_file.seek(0)
        return uploaded_file

    uploaded_file.seek(0)
    original_data = uploaded_file.read()
    uploaded_file.seek(0)

    try:
        with Image.open(BytesIO(original_data)) as source:
            if source.format != SUPPORTED_FORMATS[extension]:
                raise ValueError("Image format does not match its extension.")

            image = ImageOps.exif_transpose(source)
            image.load()

            image.thumbnail(
                (MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION),
                Image.Resampling.LANCZOS,
            )

            output = BytesIO()
            save_options = {"format": source.format}

            if source.format == "JPEG":
                if image.mode not in ("RGB", "L"):
                    image = image.convert("RGB")

                save_options.update(
                    quality=JPEG_QUALITY,
                    optimize=True,
                )

            elif source.format == "PNG":
                save_options.update(optimize=True)

            elif source.format == "WEBP":
                save_options.update(
                    quality=WEBP_QUALITY,
                    method=6,
                )

            image.save(output, **save_options)

    except (OSError, ValueError, UnidentifiedImageError):
        uploaded_file.seek(0)
        raise

    compressed_data = output.getvalue()

    if len(compressed_data) >= len(original_data):
        uploaded_file.seek(0)
        return uploaded_file

    return ContentFile(compressed_data, name=uploaded_file.name)
