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


class OptionPreference(models.Model):
    SCOPE_CUSTOM = 'custom'
    SCOPE_SCHEDULE = 'schedule'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='option_preferences')
    scope = models.CharField(max_length=20, default=SCOPE_CUSTOM)
    requirement_key = models.CharField(max_length=500)
    chosen_option_index = models.IntegerField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'scope', 'requirement_key')


class Schedule(models.Model):
    TYPE_CUSTOM = 'custom'
    TYPE_OPTIMAL = 'optimal'
    GE_IGETC = 'igetc'
    GE_CSU = 'csu'

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='schedules')
    name = models.CharField(max_length=120)
    schedule_type = models.CharField(max_length=20)
    ge_path = models.CharField(max_length=10, blank=True, default='')
    quarters = models.JSONField(default=list)
    class_bank = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'name')
        ordering = ['-updated_at']
