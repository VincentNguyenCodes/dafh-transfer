# DAFH Transfer

Transfer planner for De Anza and Foothill Community College students. Helps students identify which classes they still need to take to transfer to multiple universities for a given major, using data from ASSIST.org.

## Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Django + Django REST Framework + PostgreSQL
- Auth: JWT (djangorestframework-simplejwt)

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```
