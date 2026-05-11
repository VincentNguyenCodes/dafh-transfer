from rest_framework import serializers

from .models import StudentProgress, TransferTarget


class TransferTargetSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransferTarget
        fields = (
            'id', 'receiving_institution_id', 'receiving_institution_name',
            'major_name', 'major_code', 'academic_year_id',
        )

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class StudentProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentProgress
        fields = ('current_step',)
