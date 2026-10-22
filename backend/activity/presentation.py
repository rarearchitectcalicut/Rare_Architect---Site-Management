"""Readable activity details, with batched lookups for historical records."""

from uuid import UUID

from django.contrib.auth import get_user_model


def person_name(user):
    return user.get_full_name().strip() or user.username or "Unnamed user"


def valid_id(value):
    try:
        return UUID(str(value)) if value else None
    except (ValueError, TypeError, AttributeError):
        return None


def activity_details(logs):
    from projects.models import Project

    logs = list(logs)
    references = []
    for log in logs:
        metadata = log.metadata if isinstance(log.metadata, dict) else {}
        subject_id = valid_id(
            log.entity_id if log.entity_type == "USER"
            else metadata.get("supervisor_id") or metadata.get("user_id")
        )
        project_id = valid_id(
            log.entity_id if log.entity_type == "PROJECT"
            else metadata.get("project_id")
        )
        references.append((log, metadata, subject_id, project_id))

    user_ids = {subject_id for _, meta, subject_id, _ in references
                if subject_id and not meta.get("subject_name")}
    project_ids = {project_id for _, meta, _, project_id in references
                   if project_id and not meta.get("project_name")}
    users = get_user_model().objects.in_bulk(user_ids) if user_ids else {}
    projects = Project.objects.in_bulk(project_ids) if project_ids else {}
    result = {}
    for log, metadata, subject_id, project_id in references:
        subject = users.get(subject_id)
        project = projects.get(project_id)
        actor = log.actor
        details = {
            "actor_name": metadata.get("actor_name") or (
                person_name(actor) if actor else "System / unavailable user"
            ),
            "actor_role": metadata.get("actor_role") or (actor.role if actor else None),
            "subject_name": metadata.get("subject_name") or (
                person_name(subject) if subject else None
            ),
            "subject_role": metadata.get("subject_role") or (
                subject.role if subject else None
            ),
            "project_name": metadata.get("project_name") or (
                project.name if project else None
            ),
        }
        name = details["subject_name"] or "Unavailable user"
        role = (details["subject_role"] or "USER").capitalize()
        subject_label = f'{role} {name}'
        summaries = {
            "USER_LOGGED_IN": f"{subject_label} signed in successfully.",
            "USER_CREATED": f"Created {subject_label}'s account.",
            "USER_UPDATED": f"Updated {subject_label}'s account details.",
            "USER_ACTIVATED": f"Activated {subject_label}'s account.",
            "USER_DEACTIVATED": f"Deactivated {subject_label}'s account.",
            "USER_PASSWORD_RESET": f"Reset {subject_label}'s password.",
            "USER_PASSWORD_CHANGED": f"Changed {subject_label}'s password.",
            "SUPERVISOR_ASSIGNED": f"Assigned Supervisor {name} to {details['project_name'] or 'an unavailable project'}.",
            "SUPERVISOR_UNASSIGNED": f"Removed Supervisor {name} from {details['project_name'] or 'an unavailable project'}.",
        }
        details["summary"] = summaries.get(log.action, log.description)
        result[str(log.id)] = details
    return result
