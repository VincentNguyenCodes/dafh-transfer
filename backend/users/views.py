import os

from django.contrib.auth.models import User
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import RegisterSerializer


class RegisterView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(TokenObtainPairView):
    permission_classes = (AllowAny,)


class GoogleAuthView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request):
        credential = request.data.get('credential')
        if not credential:
            return Response({'error': 'credential required'}, status=status.HTTP_400_BAD_REQUEST)

        client_id = os.environ.get('GOOGLE_CLIENT_ID', '')
        try:
            info = id_token.verify_oauth2_token(credential, google_requests.Request(), client_id)
        except ValueError:
            return Response({'error': 'invalid token'}, status=status.HTTP_400_BAD_REQUEST)

        email = info['email']
        name = info.get('name', '')
        user, created = User.objects.get_or_create(
            email=email,
            defaults={'username': email, 'first_name': name.split()[0] if name else ''},
        )

        refresh = RefreshToken.for_user(user)
        return Response({'access': str(refresh.access_token), 'refresh': str(refresh)})
