from io import BytesIO
from pathlib import PurePosixPath
from unittest.mock import patch

from cloudinary_storage.storage import MediaCloudinaryStorage
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from .models import ProjectCategory


class CategoryCloudinaryImageTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(
            username="category_admin", first_name="Admin", phone="+919900009001",
            email="category-admin@example.com", role="ADMIN", is_staff=True,
        ))
        self.image_field = ProjectCategory._meta.get_field("image")
        storage = MediaCloudinaryStorage()
        storage_patch = patch.object(self.image_field, "storage", storage)
        storage_patch.start()
        self.addCleanup(storage_patch.stop)
        prefix_patch = patch.object(storage, "_get_prefix", return_value="media/")
        prefix_patch.start()
        self.addCleanup(prefix_patch.stop)
        upload_patch = patch(
            "cloudinary.uploader.upload", side_effect=self.cloudinary_upload,
        )
        self.upload = upload_patch.start()
        self.addCleanup(upload_patch.stop)

    @staticmethod
    def cloudinary_upload(content, **options):
        # Match use_filename=True and Cloudinary's default unique suffix.
        return {"public_id": (
            f"{options['folder']}/{PurePosixPath(content.name).stem}_abc123"
        )}

    @staticmethod
    def image_upload(extension):
        output = BytesIO()
        image_format = {"jpg": "JPEG", "png": "PNG", "webp": "WEBP"}[extension]
        Image.new("RGB", (32, 32), "blue").save(output, format=image_format)
        return SimpleUploadedFile(
            f"cover.{extension}", output.getvalue(),
            content_type=f"image/{image_format.lower()}",
        )

    def assert_saved_image_fits(self, category_id):
        category = ProjectCategory.objects.get(pk=category_id)
        self.assertEqual(len(category.image.name), 101)
        # SQLite does not enforce varchar length; run the field validators too.
        self.assertLessEqual(len(category.image.name), self.image_field.max_length)
        self.assertIn("res.cloudinary.com", category.image.url)

    def test_create_category_with_cloudinary_image(self):
        for extension in ("jpg", "png", "webp"):
            with self.subTest(extension=extension):
                response = self.client.post("/api/v1/project-categories/", {
                    "name": f"Category {extension}",
                    "image": self.image_upload(extension),
                }, format="multipart")
                self.assertEqual(response.status_code, 201, response.data)
                self.assert_saved_image_fits(response.data["id"])

    def test_add_image_to_existing_category(self):
        category = ProjectCategory.objects.create(name="Existing category")
        response = self.client.patch(
            f"/api/v1/project-categories/{category.pk}/",
            {"image": self.image_upload("png")}, format="multipart",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assert_saved_image_fits(category.pk)

    def test_create_without_image_does_not_upload(self):
        response = self.client.post("/api/v1/project-categories/", {
            "name": "No cover image",
        }, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.upload.assert_not_called()
