import logging

from apps.rbac.models import AuditLog

logger = logging.getLogger(__name__)


class AuditMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if getattr(request, "audit_entry", None):
            entry = request.audit_entry
            try:
                AuditLog.objects.create(**entry)
            except Exception as exc:  # pragma: no cover - logging must not break requests
                logger.warning("Failed to write audit log: %s", exc)
        return response


def record_audit(request, user, action, resource_type="", resource_id="", detail=""):
    target = getattr(request, "_request", request)
    target.audit_entry = {
        "user": user or (request.user if getattr(request, "user", None) and request.user.is_authenticated else None),
        "action": action,
        "resource_type": resource_type,
        "resource_id": str(resource_id) if resource_id else "",
        "detail": detail,
        "ip": request.META.get("REMOTE_ADDR"),
    }