from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Count, F, Q, Sum

from rest_framework.exceptions import ValidationError

from tasks.models import Task
from .models import DailyTaskWork


def eligible_submitted_work():
    """One eligibility rule for progress and verification limits."""
    return DailyTaskWork.objects.filter(
        verification_status__in=["VERIFIED", "PENDING"], daily_report__status="SUBMITTED",
        daily_report__project_id=F("task__project_id"),
    ).filter(
        Q(correction_of__isnull=True) | Q(
            correction_of__verification_status="REJECTED",
            correction_of__daily_report__status="SUBMITTED",
            correction_of__task_id=F("task_id"),
            correction_of__daily_report__project_id=F("task__project_id"),
            correction_of__daily_report__reported_by_id=F("daily_report__reported_by_id"),
        )
    )


def eligible_verified_work():
    return eligible_submitted_work().filter(verification_status="VERIFIED")


def verified_work_totals(task_ids):
    # Bounded to the current serialized page, never one query per task.
    return {row["task_id"]: row for row in eligible_submitted_work().filter(
        task_id__in=task_ids,
    ).order_by().values("task_id").annotate(
        quantity=Sum("quantity_completed_today", filter=Q(verification_status="VERIFIED", completion_claimed=False)),
        pending_quantity=Sum("quantity_completed_today", filter=Q(verification_status="PENDING", completion_claimed=False)),
        completions=Count("id", filter=Q(verification_status="VERIFIED", completion_claimed=True, quantity_completed_today__isnull=True)),
    )}


def calculate_task_progress(task, totals=None):
    if totals is None:
        totals = verified_work_totals([task.pk])
    values = totals.get(task.pk, {})
    result = {
        "measurement_method": task.measurement_method,
        "measurement_unit": None, "planned_quantity": None,
        "verified_quantity": None, "remaining_quantity": None,
        "pending_quantity": None, "available_quantity": None, "quantity_conflict": False,
        "progress_percentage": None, "is_fully_verified": False,
    }
    if task.approval_status != Task.ApprovalStatus.APPROVED:
        return result
    if task.measurement_method == Task.MeasurementMethod.QUANTITY:
        planned = task.planned_quantity
        if planned is None or planned <= 0 or task.measurement_unit not in Task.MeasurementUnit.values:
            return result
        quantity = values.get("quantity") or Decimal("0.000")
        pending = values.get("pending_quantity") or Decimal("0.000")
        result.update(measurement_unit=task.measurement_unit, planned_quantity=format(planned, ".3f"),
                      verified_quantity=str(quantity), remaining_quantity=str(max(planned - quantity, Decimal("0.000"))))
        result.update(pending_quantity=str(pending), available_quantity=str(max(planned - quantity - pending, Decimal("0.000"))),
                      quantity_conflict=quantity < 0 or pending < 0 or quantity + pending > planned)
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


def validate_work_capacity(task, quantity, *, report_id=None, exclude_entry_id=None, totals=None):
    """Call under the task lock for writes; drafts reserve only within their report."""
    if task.approval_status != Task.ApprovalStatus.APPROVED or task.planned_quantity is None or task.planned_quantity <= 0 or task.measurement_unit not in Task.MeasurementUnit.values:
        raise ValidationError({"quantity_completed_today": "The task has no valid approved quantity baseline. Ask Admin to review it."})
    if quantity is None or not quantity.is_finite() or quantity <= 0 or quantity.as_tuple().exponent < -3:
        raise ValidationError({"quantity_completed_today": "Enter a positive quantity with no more than three decimal places."})
    if totals is None:
        totals = verified_work_totals([task.pk])
    values = totals.get(task.pk, {})
    verified = values.get("quantity") or Decimal("0.000")
    pending = values.get("pending_quantity") or Decimal("0.000")
    if exclude_entry_id:
        previous = eligible_submitted_work().filter(pk=exclude_entry_id, task=task, verification_status="PENDING").first()
        if previous:
            pending -= previous.quantity_completed_today or Decimal("0.000")
    local = Decimal("0.000")
    if report_id:
        local = DailyTaskWork.objects.filter(daily_report_id=report_id, daily_report__status="DRAFT", task=task).exclude(pk=exclude_entry_id).aggregate(total=Sum("quantity_completed_today"))["total"] or local
    available = task.planned_quantity - verified - pending - local
    if verified < 0 or pending < 0 or quantity > available:
        raise ValidationError({"quantity_completed_today": (
            f"Only {max(available, Decimal('0.000')):.3f} {task.measurement_unit} remains available after verified, pending and other work in this draft. "
            "This quantity exceeds the approved baseline. Ask Admin to resolve conflicting pending work if the baseline changed."
        )})
