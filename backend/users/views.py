from rest_framework import generics
from rest_framework.permissions import IsAuthenticated,AllowAny
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .permissions import IsAdminRole
from .serializers import (
    SupervisorCreateSerializer,
    PhoneLoginSerializer,
    CurrentUserSerializer,
    ChangePasswordSerializer,
    SupervisorListSerializer,
)
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import status


User = get_user_model()

# Login View
class PhoneLoginView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        serializer = PhoneLoginSerializer(
            data = request.data,
            context = {"request":request},
        )
        
        serializer.is_valid(raise_exception=True)
        
        return Response(serializer.validated_data)


# Create SuperVisors
class SupervisorListCreateView(generics.ListCreateAPIView):
    """Allow administrators to create and list supervisor accounts."""

    permission_classes = [IsAuthenticated, IsAdminRole]
    
    def get_queryset(self):
        return User.objects.filter(
            role = User.Role.SUPERVISOR
        ).order_by("-created_at")
    
    def get_serializer_class(self):
        if self.request.method == "POST":
            return SupervisorCreateSerializer 
        return SupervisorListSerializer   


# Log Out
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")

        if not refresh_token:
            return Response(
                {"detail": "Refresh token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            token = RefreshToken(refresh_token)

            # Prevent one user from revoking another user's token.
            if str(token["user_id"]) != str(request.user.id):
                return Response(
                    {"detail": "Invalid refresh token."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            token.blacklist()

        except TokenError:
            return Response(
                {"detail": "Invalid or expired refresh token."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"detail": "Successfully logged out."},
            status=status.HTTP_205_RESET_CONTENT,
        )


# Current User Details View
class CurrentUserView(generics.RetrieveAPIView):
    serializer_class = CurrentUserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


# Change Password
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            {"detail": "Password changed successfully."},
            status=status.HTTP_200_OK,
        )
