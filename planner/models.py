from django.contrib.auth.models import User
from django.db import models


class StudentProgress(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='progress')
    current_step = models.IntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)


class TransferTarget(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='transfer_targets')
    receiving_institution_id = models.IntegerField()
    receiving_institution_name = models.CharField(max_length=200)
    major_name = models.CharField(max_length=200)
    major_code = models.CharField(max_length=100)
    academic_year_id = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'receiving_institution_id', 'major_code')
