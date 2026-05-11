from django.urls import path

from .views import TranscriptDetailView, TranscriptView

urlpatterns = [
    path('', TranscriptView.as_view(), name='transcript'),
    path('<int:pk>/', TranscriptDetailView.as_view(), name='transcript-detail'),
]
