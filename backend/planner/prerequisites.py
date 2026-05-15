PREREQS = {
    'SPAN 2': ['SPAN 1'], 'SPAN 3': ['SPAN 2'], 'SPAN 4': ['SPAN 3'],
    'FREN 2': ['FREN 1'], 'FREN 3': ['FREN 2'], 'FREN 4': ['FREN 3'],
    'CHIN 2': ['CHIN 1'], 'CHIN 3': ['CHIN 2'], 'CHIN 4': ['CHIN 3'],
    'JAPN 2': ['JAPN 1'], 'JAPN 3': ['JAPN 2'], 'JAPN 4': ['JAPN 3'],
    'KORE 2': ['KORE 1'], 'KORE 3': ['KORE 2'], 'KORE 4': ['KORE 3'],
    'GERM 2': ['GERM 1'], 'GERM 3': ['GERM 2'], 'GERM 4': ['GERM 3'],
    'VIET 2': ['VIET 1'], 'VIET 3': ['VIET 2'],
    'ASL 2':  ['ASL 1'],  'ASL 3':  ['ASL 2'],  'ASL 4':  ['ASL 3'],
    'ITAL 2': ['ITAL 1'], 'ITAL 3': ['ITAL 2'],

    'MATH 1B':  ['MATH 1A'],  'MATH 1C':  ['MATH 1B'],  'MATH 1D':  ['MATH 1C'],
    'MATH 1BH': ['MATH 1AH'], 'MATH 1CH': ['MATH 1BH'], 'MATH 1DH': ['MATH 1CH'],
    'MATH 2A':  ['MATH 1C'],  'MATH 2B':  ['MATH 2A'],
    'MATH 2AH': ['MATH 1CH'], 'MATH 2BH': ['MATH 2AH'],

    'CHEM 1B':  ['CHEM 1A'],  'CHEM 1C':  ['CHEM 1B'],
    'CHEM 12B': ['CHEM 12A'], 'CHEM 12C': ['CHEM 12B'],

    'PHYS 2B': ['PHYS 2A'],
    'PHYS 4B': ['PHYS 4A'], 'PHYS 4C': ['PHYS 4B'], 'PHYS 4D': ['PHYS 4C'],

    'CIS 22B': ['CIS 22A'], 'CIS 22C': ['CIS 22B'],
    'CIS 26B': ['CIS 26A'],
    'CIS 21JB': ['CIS 21JA'],

    'BIOL 6B': ['BIOL 6A'], 'BIOL 6C': ['BIOL 6B'],
}


def direct_prereqs(code):
    if code in PREREQS:
        return PREREQS[code]
    if code.endswith('H'):
        return PREREQS.get(code[:-1], [])
    return []


def chain(code, completed):
    out, seen, stack = [], set(), [code]
    while stack:
        cur = stack.pop()
        for p in direct_prereqs(cur):
            if p in seen or p in completed:
                continue
            seen.add(p)
            out.append(p)
            stack.append(p)
    out.reverse()
    return out
