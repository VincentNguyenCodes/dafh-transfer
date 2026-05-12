RECOMMENDED_SERIES = {
    (128, 'computer science'): [
        {
            'label': 'Science Electives — pick one complete series',
            'series': [
                {
                    'name': 'Calculus-Based Physics',
                    'courses': ['PHYS 4A', 'PHYS 4B', 'PHYS 4C'],
                },
                {
                    'name': 'General Chemistry',
                    'courses': ['CHEM 1A', 'CHEM 1B', 'CHEM 1C'],
                },
                {
                    'name': 'Biology',
                    'courses': ['BIOL 6A', 'BIOL 6B', 'BIOL 6C'],
                },
            ],
        }
    ],
}


def get_series_for_target(receiving_id: int, major_name: str) -> list:
    major_lower = major_name.lower()
    for (inst_id, keyword), series in RECOMMENDED_SERIES.items():
        if inst_id == receiving_id and keyword in major_lower:
            return series
    return []
