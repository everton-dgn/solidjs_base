import json
import os
import subprocess

from pathlib import Path

INVENTORY = Path(__file__).resolve().parents[2] / 'packages/create-solid/tooling/scenarios.json'
SCENARIOS = [scenario['name'] for scenario in json.loads(INVENTORY.read_text())]


def classify(event, files, *, release=False, forced=False, checked=False, count=0):
    push = event == 'push'
    full = (event not in ('push', 'pull_request') or release or forced or
            max(len(files), count) >= (300 if push else 3000))
    docs = packages = app = generator = full
    for file in files:
        moved = file['status'] in ('renamed', 'removed')
        for path in filter(None, (file['filename'], file.get('previous_filename'))):
            docs |= moved
            if path.startswith('packages/create-solid/') and path != 'packages/create-solid/package.json':
                docs = generator = True
            elif path.startswith('apps/boilerplate/'):
                app = generator = True
                docs |= path.endswith('.md')
                packages |= path.startswith('apps/boilerplate/patches/') or path == 'apps/boilerplate/package.json'
            elif path.startswith('packages/') and path.split('/')[2:3] in (['skills'], ['docs']):
                docs = packages = generator = True
            elif path.endswith('.md') or path.startswith(('docs/', '.github/ISSUE_TEMPLATE/')) or path in ('LICENSE', '.coderabbit.yaml'):
                docs = True
            else:
                docs = packages = app = generator = True
    flags = dict(docs=docs, packages=packages, app=app, generator=generator,
                 consistency=not checked or full)
    expected = {'changes': ['Changes'], 'merge-message': ['Merge commit body'] if push else [],
                'app-e2e': ['Boilerplate app E2E'] if app else [],
                'scenario': ['Generated app (' + name + ')' for name in SCENARIOS] if generator else []}
    for key, name in dict(docs='Docs', packages='Packages', app='Boilerplate app',
                          generator='Generator', consistency='Consistency').items():
        expected[key] = [name] if flags[key] else []
    return dict(**flags, expected=expected)


def api(route, paginate=False):
    args = ['gh', 'api', 'repos/' + os.environ['GITHUB_REPOSITORY'] + '/' + route]
    if paginate:
        args += ['--paginate', '--slurp']
    return json.loads(subprocess.check_output(args))


def main():
    event = os.environ['GITHUB_EVENT_NAME']
    with open(os.environ['GITHUB_EVENT_PATH']) as stream:
        payload = json.load(stream)
    files = []
    checked = False
    pr = payload.get('pull_request', {})
    release = pr.get('head', {}).get('ref', '').startswith('release-please--')
    forced = payload.get('forced', False)
    count = pr.get('changed_files', 0)
    if pr and not release and count < 3000:
        files = [file for page in api(f"pulls/{pr['number']}/files?per_page=100", True) for file in page]
        if len(files) != count:
            count = 3000
    elif event == 'push' and not forced:
        commit = api('commits/' + payload['after'])
        parents = commit['parents']
        if len(parents) == 2:
            base, head = [parent['sha'] for parent in parents]
            checked = (api(f'compare/{base}...{head}')['behind_by'] == 0 and
                       api('commits/' + head)['commit']['tree'] == commit['commit']['tree'] and
                       any(run['conclusion'] == 'success' for run in
                           api(f'commits/{head}/check-runs?check_name=CI%20required')['check_runs']))
        if not checked:
            files = api(f"compare/{payload['before']}...{payload['after']}")['files']
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        for key, value in classify(event, files, release=release, forced=forced, checked=checked, count=count).items():
            print(f'{key}={json.dumps(value)}', file=output)


if __name__ == '__main__':
    main()
