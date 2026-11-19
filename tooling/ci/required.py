import json
import os
from changes import api


def verify(expected, needs, jobs):
    if not expected or expected.keys() != needs.keys():
        raise ValueError('Expected jobs differ from direct dependencies')
    for key, names in expected.items():
        conclusion = 'success' if names else 'skipped'
        if needs[key]['result'] != conclusion:
            raise ValueError(f'{key} must be {conclusion}')
        for name in names:
            results = [job['conclusion'] for job in jobs if job['name'] == name]
            if results != ['success']:
                raise ValueError(f'{name} returned {results}')


if __name__ == '__main__':
    pages = api(f"actions/runs/{os.environ['GITHUB_RUN_ID']}/attempts/{os.environ['GITHUB_RUN_ATTEMPT']}/jobs?per_page=100", True)
    verify(json.loads(os.environ['EXPECTED']), json.loads(os.environ['NEEDS']),
           [job for page in pages for job in page['jobs']])
