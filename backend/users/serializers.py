import re

from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers
from django.contrib.auth import authenticate
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


# Create Supervisor Serializer
class SupervisorCreateSerializer(serializers.ModelSerializer):
    """Validate and create supervisor accounts."""

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone",
            "first_name",
            "last_name",
        )
        read_only_fields = ("id",)

    def validate_phone(self, value):
        value = value.strip()

        # Accept international phone numbers in E.164-style format.
        if not re.fullmatch(r"\+[1-9]\d{7,14}", value):
            raise serializers.ValidationError(
                "Enter a valid international phone number, "
                "for example +919876543210."
            )

        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError(
                "An account with this phone number already exists."
            )

        return value

    def validate_email(self, value):
        value = value.strip().lower()

        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        return value

    def validate_username(self, value):
        value = value.strip()

        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("This username is already taken.")

        return value

    def validate_first_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError("First name is required.")

        return value

    @transaction.atomic
    def create(self, validated_data):
        return User.objects.create_user(
            password="supervisor",
            role=User.Role.SUPERVISOR,
            is_active=True,
            is_staff=False,
            must_change_password=True,
            is_superuser=False,
            **validated_data,
        )


# Login Serializer with Phone
class PhoneLoginSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={"input_type": "password"},
    )

    def validate(self, attrs):
        phone = attrs["phone"].strip()
        password = attrs["password"]

        user = authenticate(
            request=self.context.get("request"),
            phone=phone,
            password=password,
        )

        if user is None:
            raise serializers.ValidationError(
                {"detail": "Invalid phone number or password."}
            )

        if not user.is_active:
            raise serializers.ValidationError({"detail": "This account is inactive."})

        refresh = RefreshToken.for_user(user)

        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": {
                "id": str(user.id),
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": user.email,
                "phone": user.phone,
                "role": user.role,
            },
        }


# Current User Details Serializer(Read Only)
class CurrentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "phone",
            "first_name",
            "must_change_password",
            "last_name",
            "role",
        ]
        read_only_fields = fields


# Change Password Serializers
class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )
    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )
    confirm_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate(self, attrs):
        user = self.context["request"].user

        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError(
                {"current_password": "Current password is incorrect."}
            )

        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )

        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError(
                {"new_password": "New password must differ from current password."}
            )

        validate_password(attrs["new_password"], user=user)

        return attrs

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password"])
        return user


# List SuperVisor Serializers
class SupervisorListSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "phone",
            "first_name",
            "last_name",
            "is_active",
            "created_at",
        )
        read_only_fields = fields


# Update Supervisor
class SupervisorUpdateSerializer(serializers.ModelSerializer):

    class Meta:
        model = User
        fields = (
            "email",
            "phone",
            "first_name",
            "last_name",
            "is_active",
        )

    def validate_email(self, value):
        # Find another user with the same email, ignoring case
        existing_user = (
            User.objects.filter(email__iexact=value)
            .exclude(id=self.instance.id)
            .exists()
        )

        if existing_user:
            raise serializers.ValidationError(
                "This email is already used by another user."
            )

        return value

    def validate_phone(self, value):
        existing_user = (
            User.objects.filter(phone=value).exclude(id=self.instance.id).exists()
        )

        if existing_user:
            raise serializers.ValidationError(
                "This phone number is already used by another user."
            )

        return value


# Supervisor Reset Password by Admin
class SupervisorResetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )
    confirm_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
    )

    def validate(self, attrs):
        user = self.context["supervisor"]

        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )

        validate_password(
            attrs["new_password"],
            user=user,
        )

        return attrs
