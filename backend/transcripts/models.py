from django.contrib.auth.models import User
from django.db import models


class TranscriptEntry(models.Model):
    SCHOOL_CHOICES = [('deanza', 'De Anza'), ('foothill', 'Foothill')]
    STATUS_CHOICES = [('completed', 'Completed'), ('in_progress', 'In Progress')]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transcript_entries')
    school = models.CharField(max_length=10, choices=SCHOOL_CHOICES)
    course_code = models.CharField(max_length=20)
    course_name = models.CharField(max_length=200)
    units = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    grade = models.CharField(max_length=5, blank=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='completed')
    term = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['school', 'course_code']
        unique_together = ('user', 'school', 'course_code')
