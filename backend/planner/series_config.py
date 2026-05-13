RECOMMENDED_SERIES = {}


def get_series_config(receiving_id: int, major_name: str) -> dict:
    major_lower = major_name.lower()
    for (inst_id, keyword), config in RECOMMENDED_SERIES.items():
        if inst_id == receiving_id and keyword in major_lower:
            return config
    return {}
