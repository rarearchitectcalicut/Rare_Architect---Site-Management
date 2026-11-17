from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):
    dependencies = [("users", "0002_user_must_change_password")]

    operations = [
        migrations.CreateModel(
            name="PersonalNotepad",
            fields=[
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, primary_key=True, related_name="personal_notepad", serialize=False, to=settings.AUTH_USER_MODEL)),
                ("content", models.TextField(blank=True, default="")),
                ("revision", models.PositiveIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
