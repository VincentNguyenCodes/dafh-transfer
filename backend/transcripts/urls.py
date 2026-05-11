from django.urls import path

from .views import TranscriptDetailView, TranscriptParseView, TranscriptView

urlpatterns = [
    path('', TranscriptView.as_view(), name='transcript'),
    path('parse/', TranscriptParseView.as_view(), name='transcript-parse'),
    path('<int:pk>/', TranscriptDetailView.as_view(), name='transcript-detail'),
]
