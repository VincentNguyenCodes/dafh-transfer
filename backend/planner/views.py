from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import OptionPreference, Schedule, StudentProgress, TransferTarget
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
        qs = OptionPreference.objects.filter(user=request.user, scope=scope)
        if key:
            qs = qs.filter(requirement_key=key)
        qs.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def _serialize_schedule(s: Schedule) -> dict:
    return {
        'id': s.id,
        'name': s.name,
        'schedule_type': s.schedule_type,
        'quarters': s.quarters,
        'class_bank': s.class_bank,
        'created_at': s.created_at.isoformat(),
        'updated_at': s.updated_at.isoformat(),
    }


class ScheduleListView(APIView):
    def get(self, request):
        return Response([_serialize_schedule(s) for s in Schedule.objects.filter(user=request.user)])

    def post(self, request):
        name = (request.data.get('name') or '').strip()
        schedule_type = request.data.get('schedule_type', Schedule.TYPE_CUSTOM)
        if schedule_type not in (Schedule.TYPE_CUSTOM, Schedule.TYPE_OPTIMAL):
            return Response({'error': 'schedule_type must be custom or optimal'}, status=status.HTTP_400_BAD_REQUEST)
        if name and Schedule.objects.filter(user=request.user, name=name).exists():
            return Response({'error': 'name already used'}, status=status.HTTP_400_BAD_REQUEST)
        s = Schedule.objects.create(
            user=request.user,
            name=name or f"Untitled schedule {Schedule.objects.filter(user=request.user).count() + 1}",
            schedule_type=schedule_type,
            quarters=request.data.get('quarters', []),
            class_bank=request.data.get('class_bank', []),
        )
        return Response(_serialize_schedule(s), status=status.HTTP_201_CREATED)


class ScheduleDetailView(APIView):
    def get(self, request, pk):
        try:
            s = Schedule.objects.get(pk=pk, user=request.user)
        except Schedule.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(_serialize_schedule(s))

    def patch(self, request, pk):
        try:
            s = Schedule.objects.get(pk=pk, user=request.user)
        except Schedule.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        new_name = request.data.get('name')
        if new_name is not None:
            new_name = new_name.strip()
            if not new_name:
                return Response({'error': 'name cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
            if Schedule.objects.filter(user=request.user, name=new_name).exclude(pk=s.pk).exists():
                return Response({'error': 'name already used'}, status=status.HTTP_400_BAD_REQUEST)
            s.name = new_name
        if 'quarters' in request.data:
            s.quarters = request.data['quarters']
        if 'class_bank' in request.data:
            s.class_bank = request.data['class_bank']
        s.save()
        return Response(_serialize_schedule(s))

    def delete(self, request, pk):
        try:
            s = Schedule.objects.get(pk=pk, user=request.user)
        except Schedule.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        s.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
