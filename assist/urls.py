from django.urls import path

from .views import AcademicYearsView, InstitutionsView, MajorsView

urlpatterns = [
    path('institutions/', InstitutionsView.as_view(), name='institutions'),
    path('academic-years/', AcademicYearsView.as_view(), name='academic-years'),
    path('majors/', MajorsView.as_view(), name='majors'),
]
