from django.contrib.auth.models import BaseUserManager


class UserManager(BaseUserManager):
    """Manage users with phone-based authentication."""

    use_in_migrations = True

    def create_user(self, phone, password=None, **extra_fields):
        if not phone or not phone.strip():
            raise ValueError("A phone number is required.")

        email = extra_fields.get("email")
        username = extra_fields.get("username")
        first_name = extra_fields.get("first_name")

        if not email or not email.strip():
            raise ValueError("An email address is required.")

        if not username or not username.strip():
            raise ValueError("A username is required.")

        if not first_name or not first_name.strip():
            raise ValueError("A first name is required.")

        extra_fields["email"] = self.normalize_email(email.strip()).lower()
        extra_fields["username"] = self.model.normalize_username(username.strip())
        extra_fields["first_name"] = first_name.strip()

        user = self.model(
            phone=phone.strip(),
            **extra_fields,
        )
        user.set_password(password)
        user.save(using=self._db)

        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        if not password:
            raise ValueError("A superuser password is required.")

        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("role", "ADMIN")

        if extra_fields["is_staff"] is not True:
            raise ValueError("A superuser must have is_staff=True.")

        if extra_fields["is_superuser"] is not True:
            raise ValueError("A superuser must have is_superuser=True.")

        if extra_fields["role"] != "ADMIN":
            raise ValueError("A superuser must have the ADMIN role.")

        return self.create_user(
            phone=phone,
            password=password,
            **extra_fields,
        )
