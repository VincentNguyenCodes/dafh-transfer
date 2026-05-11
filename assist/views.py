from rest_framework.response import Response
from rest_framework.views import APIView

from . import client
from .constants import DEANZA_ID, FOOTHILL_ID, LATEST_YEAR_ID


class InstitutionsView(APIView):
    def get(self, request):
        institutions = client.get_receiving_institutions(DEANZA_ID)
        return Response(institutions)


class AcademicYearsView(APIView):
    def get(self, request):
        data = client.get_academic_years(DEANZA_ID)
        return Response(data)


class MajorsView(APIView):
    def get(self, request):
        receiving_id = request.query_params.get('receivingId')
        academic_year_id = request.query_params.get('academicYearId', LATEST_YEAR_ID)
        if not receiving_id:
            return Response({'error': 'receivingId is required'}, status=400)

        deanza_majors = []
        foothill_majors = []

        try:
            deanza_majors = client.get_agreements(int(receiving_id), DEANZA_ID, int(academic_year_id))
        except Exception:
            pass
        try:
            foothill_majors = client.get_agreements(int(receiving_id), FOOTHILL_ID, int(academic_year_id))
        except Exception:
            pass

        seen_labels = set()
        combined = []
        for report in (deanza_majors.get('reports', []) if isinstance(deanza_majors, dict) else deanza_majors) + \
                      (foothill_majors.get('reports', []) if isinstance(foothill_majors, dict) else foothill_majors):
            label = report.get('label', '')
            if label and label not in seen_labels:
                seen_labels.add(label)
                combined.append({'label': label, 'key': report.get('key', '')})

        combined.sort(key=lambda m: m['label'])
        return Response(combined)
