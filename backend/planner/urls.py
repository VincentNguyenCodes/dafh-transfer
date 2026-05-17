from django.urls import path

from .views import BestScheduleView, ChatView, OptionPreferenceView, ProgressView, ResultsView, ScheduleDetailView, ScheduleListView, TransferTargetDetailView, TransferTargetView

urlpatterns = [
    path('progress/', ProgressView.as_view(), name='progress'),
    path('chat/', ChatView.as_view(), name='chat'),
    path('targets/', TransferTargetView.as_view(), name='targets'),
    path('targets/<int:pk>/', TransferTargetDetailView.as_view(), name='target-detail'),
    path('results/', ResultsView.as_view(), name='results'),
    path('best-schedule/', BestScheduleView.as_view(), name='best-schedule'),
    path('option-preferences/', OptionPreferenceView.as_view(), name='option-preferences'),
    path('schedules/', ScheduleListView.as_view(), name='schedules'),
    path('schedules/<int:pk>/', ScheduleDetailView.as_view(), name='schedule-detail'),
]
