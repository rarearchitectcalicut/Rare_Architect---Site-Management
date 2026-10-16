import django_filters

from .models import Project


class ProjectFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(choices=Project.Status.choices)

    category = django_filters.UUIDFilter(field_name="category_id")

    start_date = django_filters.DateFilter(
        field_name="start_date",
        lookup_expr="gte",
    )

    end_date = django_filters.DateFilter(
        field_name="end_date",
        lookup_expr="lte",
    )

    class Meta:
        model = Project
        fields = [
            "status",
            "category",
            "start_date",
            "end_date",
        ]
