from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Sum

from tasks.models import Task

from .models import DailyTaskWork

# =====================================================
# TASK PROGRESS CALCULATION
# =====================================================


def calculate_task_progress(task):
    """
    Calculate progress from Admin-verified
    daily work entries only.

    No manually entered progress percentage.
    """

    verified_entries = DailyTaskWork.objects.filter(
        task=task,
        verification_status=(DailyTaskWork.VerificationStatus.VERIFIED),
    )

    # -----------------------------------------
    # QUANTITY-BASED TASK
    # -----------------------------------------

    if task.measurement_method == Task.MeasurementMethod.QUANTITY:

        planned_quantity = task.planned_quantity

        verified_quantity = verified_entries.aggregate(
            total=Sum("quantity_completed_today")
        )["total"] or Decimal("0.000")

        if planned_quantity is None or planned_quantity <= 0:
            return {
                "measurement_method": "QUANTITY",
                "measurement_unit": task.measurement_unit,
                "planned_quantity": None,
                "verified_quantity": str(verified_quantity),
                "remaining_quantity": None,
                "progress_percentage": None,
                "is_fully_verified": False,
            }

        remaining_quantity = max(
            planned_quantity - verified_quantity,
            Decimal("0.000"),
        )

        percentage = ((verified_quantity / planned_quantity) * Decimal("100")).quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        )

        return {
            "measurement_method": "QUANTITY",
            "measurement_unit": task.measurement_unit,
            "planned_quantity": str(planned_quantity),
            "verified_quantity": str(verified_quantity),
            "remaining_quantity": str(remaining_quantity),
            "progress_percentage": str(percentage),
            "is_fully_verified": (verified_quantity >= planned_quantity),
        }

    # -----------------------------------------
    # COMPLETION-ONLY TASK
    # -----------------------------------------

    if task.measurement_method == Task.MeasurementMethod.COMPLETION_ONLY:
        completion_verified = verified_entries.filter(
            completion_claimed=True,
        ).exists()

        return {
            "measurement_method": "COMPLETION_ONLY",
            "measurement_unit": None,
            "planned_quantity": None,
            "verified_quantity": None,
            "remaining_quantity": None,
            "progress_percentage": ("100.00" if completion_verified else "0.00"),
            "is_fully_verified": completion_verified,
        }

    raise ValueError("Unsupported task measurement method.")
