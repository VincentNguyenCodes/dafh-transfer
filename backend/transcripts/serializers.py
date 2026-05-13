from rest_framework import serializers

from .models import TranscriptEntry


class TranscriptEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = TranscriptEntry
        fields = ('id', 'school', 'course_code', 'course_name', 'units', 'grade', 'status', 'term')

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
