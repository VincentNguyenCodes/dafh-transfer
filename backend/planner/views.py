from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import OptionPreference, StudentProgress, TransferTarget
from .results import compute_best_schedule, compute_remaining
from .serializers import StudentProgressSerializer, TransferTargetSerializer


class ProgressView(APIView):
    def get(self, request):
        progress, _ = StudentProgress.objects.get_or_create(user=request.user)
        return Response(StudentProgressSerializer(progress).data)

    def patch(self, request):
        progress, _ = StudentProgress.objects.get_or_create(user=request.user)
        serializer = StudentProgressSerializer(progress, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TransferTargetView(APIView):
    def get(self, request):
        targets = TransferTarget.objects.filter(user=request.user)
        return Response(TransferTargetSerializer(targets, many=True).data)

    def post(self, request):
        serializer = TransferTargetSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TransferTargetDetailView(APIView):
    def delete(self, request, pk):
        try:
            target = TransferTarget.objects.get(pk=pk, user=request.user)
        except TransferTarget.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        target.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ResultsView(APIView):
    def get(self, request):
        results = compute_remaining(request.user)
        return Response(results)


class BestScheduleView(APIView):
    def get(self, request):
        results = compute_remaining(request.user)
        prefs = {
            p.requirement_key: p.chosen_option_index
            for p in OptionPreference.objects.filter(user=request.user, scope=OptionPreference.SCOPE_SCHEDULE)
        }
        schedule = compute_best_schedule(results, user_prefs=prefs)
        return Response(schedule)


class OptionPreferenceView(APIView):
    def get(self, request):
        scope = request.query_params.get('scope') or OptionPreference.SCOPE_CUSTOM
        prefs = OptionPreference.objects.filter(user=request.user, scope=scope).values('requirement_key', 'chosen_option_index')
        return Response(list(prefs))

    def post(self, request):
        scope = request.data.get('scope') or OptionPreference.SCOPE_CUSTOM
        key = request.data.get('requirement_key')
        idx = request.data.get('chosen_option_index')
        if not key or idx is None:
            return Response({'error': 'requirement_key and chosen_option_index required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            idx = int(idx)
        except (TypeError, ValueError):
            return Response({'error': 'chosen_option_index must be an integer'}, status=status.HTTP_400_BAD_REQUEST)
        OptionPreference.objects.update_or_create(
            user=request.user,
            scope=scope,
            requirement_key=key,
            defaults={'chosen_option_index': idx},
        )
        return Response({'scope': scope, 'requirement_key': key, 'chosen_option_index': idx})

    def delete(self, request):
        scope = request.data.get('scope') or request.query_params.get('scope') or OptionPreference.SCOPE_CUSTOM
        key = request.data.get('requirement_key') or request.query_params.get('requirement_key')
        if not key:
            return Response({'error': 'requirement_key required'}, status=status.HTTP_400_BAD_REQUEST)
        OptionPreference.objects.filter(user=request.user, scope=scope, requirement_key=key).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
