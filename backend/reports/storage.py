from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateReportStorage(FileSystemStorage):
    """
    Store report evidence outside the public
    Django media directory.
    """

    def __init__(self, *args, **kwargs):
        kwargs.setdefault(
            "location",
            settings.PRIVATE_MEDIA_ROOT,
        )
        # No public base_url.
        kwargs.setdefault("base_url", None)
        super().__init__(*args, **kwargs)


private_report_storage = PrivateReportStorage()
