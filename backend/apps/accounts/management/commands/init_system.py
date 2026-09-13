import getpass

from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand, CommandError

from apps.sysadmin.init_service import initialize_platform
from apps.sysadmin.models import SystemSetting


class Command(BaseCommand):
    help = "Initialize the GIS platform: run migrations, seed roles/permissions, create System Administrator."

    def add_arguments(self, parser):
        parser.add_argument("--name", default="", help="Full name of the administrator")
        parser.add_argument("--username", default="", help="Username")
        parser.add_argument("--email", default="", help="Email")
        parser.add_argument("--password", default="", help="Password (prompted if not provided)")
        parser.add_argument("--token", default="", help="Initial password hash token from .env (optional)")

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING("GeoDash GIS Platform Initialization"))
        self._migrate()
        username = options["username"] or input("Username: ").strip()
        email = options["email"] or input("Email: ").strip()
        name = options["name"] or input("Admin Name: ").strip()
        password = options["password"]
        if not password:
            password = getpass.getpass("Password: ")
            confirm = getpass.getpass("Confirm Password: ")
            if password != confirm:
                raise CommandError("Passwords do not match.")
        try:
            initialize_platform(name=name, username=username, email=email, password=password)
        except ValueError as exc:
            raise CommandError(str(exc))
        token = options.get("token")
        if token:
            SystemSetting.set("INITIAL_PASSWORD_HASH", make_password(token), value_type="hash")
            self.stdout.write(self.style.SUCCESS("Initial token hash stored in system settings."))
        self.stdout.write(self.style.SUCCESS(f"System Administrator '{username}' created."))
        self.stdout.write(self.style.SUCCESS("System initialized successfully."))

    def _migrate(self):
        from django.core.management import call_command

        call_command("migrate", interactive=False, verbosity=0)