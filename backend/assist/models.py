from django.db import models


class AssistCache(models.Model):
    receiving_institution_id = models.IntegerField()
    sending_institution_id = models.IntegerField()
    academic_year_id = models.IntegerField()
    major_code = models.CharField(max_length=100)
    raw_json = models.JSONField()
    cached_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('receiving_institution_id', 'sending_institution_id', 'academic_year_id', 'major_code')
