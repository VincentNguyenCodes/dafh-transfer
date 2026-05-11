# DAFH Transfer

Transfer planner for De Anza and Foothill Community College students. Helps students identify which classes they still need to take to transfer to multiple universities for a given major, using live data from ASSIST.org.

## Project Structure

```
dafh-transfer/
├── backend/        Django + DRF + PostgreSQL API
├── frontend/       React + TypeScript + Vite + Tailwind
└── documentation/  Project docs and notes
```

## Stack

- **Backend**: Django, Django REST Framework, PostgreSQL, JWT auth
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **AI**: Claude Haiku (advisory text parsing, cached 365 days)
- **Data**: ASSIST.org articulation API

## Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in your values
python manage.py migrate
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables (backend/.env)

```
SECRET_KEY=your-secret-key
DB_NAME=dafh_transfer
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
ANTHROPIC_API_KEY=sk-ant-...
```

Create the PostgreSQL database first:
```bash
psql -U postgres -c "CREATE DATABASE dafh_transfer;"
```
