"""Convenience helpers to write audit entries from DRF views."""

from .middleware import record_audit


def audit(request, action, resource_type="", resource_id="", detail="", user=None):
    """Queue an audit entry to be persisted by AuditMiddleware after the response."""
    record_audit(
        request,
        user=user or (request.user if getattr(request, "user", None) and request.user.is_authenticated else None),
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail[:2000],
    )