from rest_framework.response import Response
from rest_framework.views import APIView

from . import client
from .constants import DEANZA_ID, LATEST_YEAR_ID


class InstitutionsView(APIView):
    def get(self, request):
        raw = client.get_receiving_institutions(DEANZA_ID)
        institutions = []
        for inst in raw:
            if inst.get('isCommunityCollege'):
                continue
            if LATEST_YEAR_ID not in inst.get('receivingYearIds', []):
                continue
            institutions.append({
                'id': inst['institutionParentId'],
                'name': inst['institutionName'],
            })
        institutions.sort(key=lambda x: x['name'])
        return Response(institutions)


class AcademicYearsView(APIView):
    def get(self, request):
        return Response({'latestYearId': LATEST_YEAR_ID})


class MajorsView(APIView):
    def get(self, request):
        receiving_id = request.query_params.get('receivingId')
        academic_year_id = int(request.query_params.get('academicYearId', LATEST_YEAR_ID))
        if not receiving_id:
            return Response({'error': 'receivingId is required'}, status=400)

        from .constants import FOOTHILL_ID
        seen = set()
        combined = []

        for sending_id in [DEANZA_ID, FOOTHILL_ID]:
            try:
                data = client.get_agreements(int(receiving_id), sending_id, academic_year_id)
                reports = data.get('reports', []) if isinstance(data, dict) else []
                for r in reports:
                    label = r.get('label', '')
                    if label and label not in seen:
                        seen.add(label)
                        combined.append({'label': label, 'key': r.get('key', '')})
            except Exception:
                pass

        combined.sort(key=lambda m: m['label'])
        return Response(combined)
