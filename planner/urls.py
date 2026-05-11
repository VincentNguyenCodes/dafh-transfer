from django.urls import path

from .views import ProgressView, ResultsView, TransferTargetDetailView, TransferTargetView

urlpatterns = [
    path('progress/', ProgressView.as_view(), name='progress'),
    path('targets/', TransferTargetView.as_view(), name='targets'),
    path('targets/<int:pk>/', TransferTargetDetailView.as_view(), name='target-detail'),
    path('results/', ResultsView.as_view(), name='results'),
]
