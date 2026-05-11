import requests

ASSIST_BASE = 'https://assist.org/api'

HEADERS = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
}


def get_institutions():
    resp = requests.get(f'{ASSIST_BASE}/institutions', headers=HEADERS, timeout=10)
    resp.raise_for_status()
    return resp.json()


def get_academic_years():
    resp = requests.get(f'{ASSIST_BASE}/AcademicYears', headers=HEADERS, timeout=10)
    resp.raise_for_status()
    return resp.json()


def get_agreements(receiving_id, sending_id, academic_year_id, major_code):
    params = {
        'receivingInstitutionId': receiving_id,
        'sendingInstitutionId': sending_id,
        'academicYearId': academic_year_id,
        'categoryCode': major_code,
    }
    resp = requests.get(f'{ASSIST_BASE}/agreements', headers=HEADERS, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_majors_for_pair(receiving_id, sending_id, academic_year_id):
    params = {
        'receivingInstitutionId': receiving_id,
        'sendingInstitutionId': sending_id,
        'academicYearId': academic_year_id,
        'type': 'Major',
    }
    resp = requests.get(
        f'{ASSIST_BASE}/agreements/published/for/{receiving_id}/to/{sending_id}/in/{academic_year_id}',
        headers=HEADERS,
        params={'types': 'Major'},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()
