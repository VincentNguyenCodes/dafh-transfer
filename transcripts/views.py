from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TranscriptEntry
from .serializers import TranscriptEntrySerializer


class TranscriptView(APIView):
    def get(self, request):
        entries = TranscriptEntry.objects.filter(user=request.user)
        serializer = TranscriptEntrySerializer(entries, many=True)
        return Response(serializer.data)

    def post(self, request):
        many = isinstance(request.data, list)
        serializer = TranscriptEntrySerializer(
            data=request.data, many=many, context={'request': request}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TranscriptDetailView(APIView):
    def delete(self, request, pk):
        try:
            entry = TranscriptEntry.objects.get(pk=pk, user=request.user)
        except TranscriptEntry.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
