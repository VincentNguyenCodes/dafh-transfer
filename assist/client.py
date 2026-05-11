import requests

ASSIST_BASE = 'https://assist.org/api'
ASSIST_HOME = 'https://assist.org/'

_session = None


def _get_session() -> requests.Session:
    global _session
    if _session is not None:
        return _session

    s = requests.Session()
    s.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'Referer': ASSIST_HOME,
    })
    s.get(ASSIST_HOME, timeout=10)
    xsrf = next((c.value for c in s.cookies if c.name == 'X-XSRF-TOKEN'), '')
    s.headers['X-XSRF-TOKEN'] = xsrf
    _session = s
    return s


def _get(path: str, params: dict = None) -> dict:
    s = _get_session()
    resp = s.get(f'{ASSIST_BASE}{path}', params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_institutions() -> list:
    return _get('/institutions')


def get_academic_years(institution_id: int) -> dict:
    return _get(f'/institutions/{institution_id}/transferability/availableAcademicYears')


def get_agreements(receiving_id: int, sending_id: int, academic_year_id: int, category_code: str = 'major') -> list:
    return _get('/agreements', params={
        'receivingInstitutionId': receiving_id,
        'sendingInstitutionId': sending_id,
        'academicYearId': academic_year_id,
        'categoryCode': category_code,
    })


def get_articulation(key: str) -> dict:
    return _get(f'/articulation/Agreements', params={'Key': key})


def get_receiving_institutions(sending_id: int) -> list:
    return _get(f'/institutions/{sending_id}/agreements')
