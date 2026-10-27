from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, F, Q, Sum

from tasks.models import Task
from .models import DailyTaskWork


def eligible_verified_work():
    """One eligibility rule for progress and verification limits."""
    return DailyTaskWork.objects.filter(
        verification_status="VERIFIED", daily_report__status="SUBMITTED",
        daily_report__project_id=F("task__project_id"),
    ).filter(
        Q(correction_of__isnull=True) | Q(
            correction_of__verification_status="REJECTED",
            correction_of__daily_report__status="SUBMITTED",
            correction_of__task_id=F("task_id"),
        )
    )


def verified_work_totals(task_ids):
    # Bounded to the current serialized page, never one query per task.
    return {row["task_id"]: row for row in eligible_verified_work().filter(
        task_id__in=task_ids,
    ).order_by().values("task_id").annotate(
        quantity=Sum("quantity_completed_today", filter=Q(completion_claimed=False)),
        completions=Count("id", filter=Q(completion_claimed=True, quantity_completed_today__isnull=True)),
    )}


def calculate_task_progress(task, totals=None):
    if totals is None:
        totals = verified_work_totals([task.pk])
    values = totals.get(task.pk, {})
    result = {
        "measurement_method": task.measurement_method,
        "measurement_unit": None, "planned_quantity": None,
        "verified_quantity": None, "remaining_quantity": None,
        "progress_percentage": None, "is_fully_verified": False,
    }
    if task.approval_status != Task.ApprovalStatus.APPROVED:
        return result
    if task.measurement_method == Task.MeasurementMethod.QUANTITY:
        planned = task.planned_quantity
        if planned is None or planned <= 0 or task.measurement_unit not in Task.MeasurementUnit.values:
            return result
        quantity = values.get("quantity") or Decimal("0.000")
        result.update(measurement_unit=task.measurement_unit, planned_quantity=format(planned, ".3f"),
                      verified_quantity=str(quantity), remaining_quantity=str(max(planned - quantity, Decimal("0.000"))))
        # Corrupt legacy totals must be visible as unavailable, never hidden by clamping.
        if quantity < 0 or quantity > planned:
            return result
        percentage = (quantity * Decimal("100") / planned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        result.update(progress_percentage=str(min(percentage, Decimal("100.00"))), is_fully_verified=quantity == planned)
    elif task.measurement_method == Task.MeasurementMethod.COMPLETION_ONLY:
        if task.planned_quantity is not None or task.measurement_unit:
            return result
        completed = bool(values.get("completions"))
        result.update(progress_percentage="100.00" if completed else "0.00", is_fully_verified=completed)
    return result
