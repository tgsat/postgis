import hashlib
import secrets
import time

from django.contrib.auth.models import AbstractUser
from django.db import models


def generate_org_id():
    """Generate a unique 10-char org id mixing digits and upper/lowercase letters."""
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    for _ in range(1000):
        digest = hashlib.sha256(f"{secrets.token_hex(16)}-{time.time_ns()}".encode("utf-8")).hexdigest()
        candidate = "".join(alphabet[int(digest[i : i + 2], 16) % len(alphabet)] for i in range(0, 20, 2))
        if not Company.objects.filter(org_id=candidate).exists():
            return candidate
    raise RuntimeError("Unable to generate a unique organization id")


class Company(models.Model):
    name = models.CharField(max_length=150)
    org_id = models.CharField(max_length=10, unique=True, editable=False)
    code = models.SlugField(max_length=150, unique=True, blank=True, null=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "companies"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.org_id:
            self.org_id = generate_org_id()
        super().save(*args, **kwargs)


class User(AbstractUser):
    ROLE_CHOICES = [
        ("system_admin", "System Administrator"),
        ("company_admin", "Company Admin"),
        ("gis_manager", "GIS Manager"),
        ("editor", "Editor"),
        ("surveyor", "Surveyor"),
        ("viewer", "Viewer"),
    ]

    phone = models.CharField(max_length=30, blank=True)
    role_type = models.CharField(max_length=30, choices=ROLE_CHOICES, default="viewer")
    companies = models.ManyToManyField(Company, through="Membership", related_name="members")
    is_system_admin = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def primary_company(self):
        return Membership.objects.filter(user=self, is_primary=True).select_related("company").first()

    def has_company_access(self, company):
        return self.is_system_admin or Membership.objects.filter(user=self, company=company).exists()

    def __str__(self):
        return self.username


class Membership(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    company = models.ForeignKey(Company, on_delete=models.CASCADE)
    role = models.CharField(max_length=30, choices=User.ROLE_CHOICES, default="viewer")
    is_primary = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "company")

    def __str__(self):
        return f"{self.user.username} @ {self.company.name} ({self.role})"