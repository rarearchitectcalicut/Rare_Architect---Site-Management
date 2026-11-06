from django.utils.deconstruct import deconstructible

from common.storage_selector import SelectablePrivateStorage


@deconstructible
class PrivateReportStorage(SelectablePrivateStorage):
    def __init__(self):
        super().__init__("PRIVATE_MEDIA_ROOT")


private_report_storage = PrivateReportStorage()
