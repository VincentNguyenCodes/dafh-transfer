import anthropic
from django.conf import settings
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
        ge_path = request.query_params.get('ge_path', '')
        results = compute_remaining(request.user, ge_path=ge_path)
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
        'ge_path': s.ge_path,
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
            ge_path=request.data.get('ge_path', ''),
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


class ChatView(APIView):
    def post(self, request):
        user_message = (request.data.get('message') or '').strip()
        history = request.data.get('history', [])
        if not user_message:
            return Response({'error': 'message required'}, status=status.HTTP_400_BAD_REQUEST)

        from transcripts.models import TranscriptEntry
        entries = list(TranscriptEntry.objects.filter(user=request.user).values('course_code', 'course_name', 'status'))
        targets = list(TransferTarget.objects.filter(user=request.user).values('receiving_institution_name', 'major_name'))

        courses_str = ', '.join(
            f"{e['course_code']} ({'in progress' if e['status'] == 'in_progress' else 'done'})"
            for e in entries
        ) or 'None added yet'

        targets_str = ', '.join(
            f"{t['receiving_institution_name']} ({t['major_name']})"
            for t in targets
        ) or 'None added yet'

        system = (
            "You are a knowledgeable, friendly transfer advisor for De Anza and Foothill Community College students. "
            "Help students understand ASSIST.org articulation, transfer requirements, GE patterns (Cal-GETC), "
            "and how to plan courses for UC and CSU transfer. Keep answers concise, warm, and practical. "
            "Use plain language — no jargon unless the student uses it first.\n\n"
            f"Student's courses on file: {courses_str}\n"
            f"Transfer targets: {targets_str}"
        )

        msgs = [
            {'role': m['role'], 'content': m['content']}
            for m in (history or [])[-10:]
            if m.get('role') in ('user', 'assistant') and m.get('content')
        ]
        msgs.append({'role': 'user', 'content': user_message})

        try:
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            response = client.messages.create(
                model='claude-haiku-4-5-20251001',
                max_tokens=500,
                system=system,
                messages=msgs,
            )
            return Response({'reply': response.content[0].text})
        except Exception:
            return Response({'error': 'Advisor unavailable. Please try again.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
