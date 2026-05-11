from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import StudentProgress, TransferTarget
from .results import compute_remaining
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
        remaining = compute_remaining(request.user)
        deanza = [c for c in remaining if c['school'] == 'deanza']
        foothill = [c for c in remaining if c['school'] == 'foothill']
        return Response({'deanza': deanza, 'foothill': foothill})
