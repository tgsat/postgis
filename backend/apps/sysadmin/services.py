import logging
import os
import subprocess
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.db.models import Sum
from rest_framework import serializers

from .models import BackupJob, StorageUsage, SystemSetting

logger = logging.getLogger(__name__)


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = ["id", "key", "value", "value_type", "description", "updated_at"]


class BackupJobSerializer(serializers.ModelSerializer):
    creator = serializers.CharField(source="created_by.username", read_only=True, allow_null=True)

    class Meta:
        model = BackupJob
        fields = [
            "id", "name", "file_path", "size_bytes", "status", "error", "creator", "started_at", "finished_at",
        ]


class StorageUsageSerializer(serializers.ModelSerializer):
    class Meta:
        model = StorageUsage
        fields = [
            "id", "scope_type", "company", "storage_bytes", "attachment_count",
            "database_bytes", "recorded_at",
        ]


def run_backup(user=None):
    from apps.layers.models import Attachment

    export_dir = settings.EXPORT_STORAGE
    export_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.sql"
    filepath = export_dir / filename

    job = BackupJob.objects.create(name=filename, file_path=str(filepath), created_by=user)
    host = settings.DATABASES["default"]["HOST"]
    port = settings.DATABASES["default"]["PORT"] or "5432"
    name = settings.DATABASES["default"]["NAME"]
    dbuser = settings.DATABASES["default"]["USER"]
    dbpass = settings.DATABASES["default"]["PASSWORD"]

    try:
        env = {**os.environ, "PGPASSWORD": dbpass}
        result = subprocess.run(
            ["pg_dump", "-h", host, "-p", port, "-U", dbuser, "-d", name, "-F", "c", "-f", str(filepath)],
            env=env, capture_output=True, text=True, timeout=1800,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr)
        job.size_bytes = filepath.stat().st_size
        job.status = "success"
        job.finished_at = datetime.utcnow()
        job.save(update_fields=["size_bytes", "status", "finished_at"])
        db_bytes = database_disk_bytes()
        global_total = Attachment.objects.aggregate(total=Sum("size")).get("total") or 0
        record_storage_usage(global_total=global_total, db_bytes=db_bytes)
        return job
    except Exception as exc:
        logger.exception("Backup failed")
        job.status = "failed"
        job.error = str(exc)
        job.finished_at = datetime.utcnow()
        job.save(update_fields=["status", "error", "finished_at"])
        if filepath.exists():
            filepath.unlink()
        return job


def database_disk_bytes():
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT COALESCE(pg_database_size(current_database()), 0)"
        )
        return cursor.fetchone()[0]


def record_storage_usage(global_total=0, db_bytes=0):
    from apps.layers.models import Attachment

    StorageUsage.objects.create(
        scope_type="global",
        storage_bytes=global_total,
        attachment_count=Attachment.objects.count(),
        database_bytes=db_bytes,
    )


def database_info():
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT datname,
                   pg_size_pretty(pg_database_size(datname)) AS size,
                   pg_database_size(datname) AS bytes
            FROM pg_database
            ORDER BY bytes DESC
            """
        )
        databases = [
            {"name": row[0], "size": row[1], "bytes": row[2]}
            for row in cursor.fetchall()
        ]
        cursor.execute("SELECT postgis_version()")
        postgis = cursor.fetchone()[0]
        cursor.execute(
            """
            SELECT schemaname, tablename
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY schemaname, tablename
            """
        )
        tables = [{"schema": r[0], "table": r[1]} for r in cursor.fetchall()]
    return {"postgis_version": postgis, "databases": databases, "tables": tables}


def restore_from_file(filepath, user=None):
    from django.conf import settings

    host = settings.DATABASES["default"]["HOST"]
    port = settings.DATABASES["default"]["PORT"] or "5432"
    name = settings.DATABASES["default"]["NAME"]
    dbuser = settings.DATABASES["default"]["USER"]
    dbpass = settings.DATABASES["default"]["PASSWORD"]
    job = BackupJob.objects.create(name=f"restore_{Path(filepath).name}", created_by=user)
    try:
        env = {**os.environ, "PGPASSWORD": dbpass}
        result = subprocess.run(
            ["pg_restore", "-h", host, "-p", port, "-U", dbuser, "-d", name, "--clean", "--if-exists", str(filepath)],
            env=env, capture_output=True, text=True, timeout=3600,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr[:2000])
        job.status = "success"
        job.finished_at = datetime.utcnow()
        job.save(update_fields=["status", "finished_at"])
        return job
    except Exception as exc:
        logger.exception("Restore failed")
        job.status = "failed"
        job.error = str(exc)
        job.finished_at = datetime.utcnow()
        job.save(update_fields=["status", "error", "finished_at"])
        return job