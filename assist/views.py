from rest_framework.response import Response
from rest_framework.views import APIView

from . import client


class InstitutionsView(APIView):
    def get(self, request):
        data = client.get_institutions()
        return Response(data)


class AcademicYearsView(APIView):
    def get(self, request):
        data = client.get_academic_years()
        return Response(data)


class MajorsView(APIView):
    def get(self, request):
        receiving_id = request.query_params.get('receivingId')
        sending_id = request.query_params.get('sendingId')
        academic_year_id = request.query_params.get('academicYearId')
        if not all([receiving_id, sending_id, academic_year_id]):
            return Response({'error': 'receivingId, sendingId, and academicYearId are required'}, status=400)
        data = client.get_majors_for_pair(receiving_id, sending_id, academic_year_id)
        return Response(data)
