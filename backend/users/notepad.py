from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.cache import never_cache
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PersonalNotepad
from .permissions import MustChangePasswordPermission


class NotepadUpdateSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=20000, allow_blank=True, trim_whitespace=False)
    revision = serializers.IntegerField(min_value=0)


def note_data(note):
    return {"content": note.content, "revision": note.revision, "updated_at": note.updated_at.isoformat()}


@method_decorator(never_cache, name="dispatch")
class PersonalNotepadView(APIView):
    permission_classes = [IsAuthenticated, MustChangePasswordPermission]
    http_method_names = ["get", "put", "head", "options"]

    def get(self, request):
        note, _ = PersonalNotepad.objects.get_or_create(user=request.user)
        return Response(note_data(note))

    @transaction.atomic
    def put(self, request):
        serializer = NotepadUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note, _ = PersonalNotepad.objects.get_or_create(user=request.user)
        # Atomic compare-and-swap prevents lost edits between tabs/devices.
        changed = PersonalNotepad.objects.filter(user=request.user, revision=serializer.validated_data["revision"]).update(
            content=serializer.validated_data["content"], revision=F("revision") + 1, updated_at=timezone.now(),
        )
        note.refresh_from_db()
        if not changed:
            return Response({"detail": "Your notes changed in another tab or device. Choose which version to keep.", "current": note_data(note)}, status=409)
        return Response(note_data(note))
