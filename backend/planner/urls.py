from django.urls import path

from .views import BestScheduleView, OptionPreferenceView, ProgressView, ResultsView, TransferTargetDetailView, TransferTargetView

urlpatterns = [
    path('progress/', ProgressView.as_view(), name='progress'),
    path('targets/', TransferTargetView.as_view(), name='targets'),
    path('targets/<int:pk>/', TransferTargetDetailView.as_view(), name='target-detail'),
    path('results/', ResultsView.as_view(), name='results'),
    path('best-schedule/', BestScheduleView.as_view(), name='best-schedule'),
    path('option-preferences/', OptionPreferenceView.as_view(), name='option-preferences'),
]
