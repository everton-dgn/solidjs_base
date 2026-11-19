import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from changes import classify, main, SCENARIOS
from required import verify


class Jobs(unittest.TestCase):
    def test_routes(self):
        for path, enabled in (
            ('docs/tooling/no-server.md', ['docs']),
            ('packages/solid-runtime/README.md', ['docs']),
            ('apps/boilerplate/fonts.ts', ['app', 'generator']),
            ('packages/create-solid/docs/install.md', ['docs', 'generator']),
            ('packages/solid-runtime/src/index.ts', ['app', 'docs', 'packages', 'generator']),
            ('apps/boilerplate/AGENTS.md', ['docs', 'app', 'generator']),
            ('apps/boilerplate/patches/fix.patch', ['packages', 'app', 'generator']),
            ('apps/boilerplate/package.json', ['packages', 'app', 'generator']),
            ('packages/solid-tooling/docs/install.md', ['docs', 'packages', 'generator']),
            ('packages/solid-tooling/CHANGELOG.md', ['docs']),
            ('packages/solid-tooling/src/vite/tasks.ts', ['app', 'docs', 'packages', 'generator']),
            ('bun.lock', ['app', 'docs', 'packages', 'generator']),
            ('packages/create-solid/package.json', ['app', 'docs', 'packages', 'generator']),
        ):
            result = classify('pull_request', [dict(filename=path, status='modified')])
            self.assertEqual({key for key in ('app', 'docs', 'packages', 'generator') if result[key]}, set(enabled), path)
            self.assertTrue(result['consistency'])

    def test_moved(self):
        rename = dict(filename='docs/new.md', previous_filename='apps/boilerplate/old.ts', status='renamed')
        self.assertTrue(classify('pull_request', [rename])['app'])
        deletion = dict(filename='apps/boilerplate/fonts.ts', status='removed')
        self.assertTrue(classify('pull_request', [deletion])['docs'])

    def test_full(self):
        for event, args in [('push', dict(forced=True)), ('pull_request', dict(count=3000)),
                            ('pull_request', dict(branch="release-please--branches--main")), ('schedule', {})]:
            result = classify(event, [], **args)
            self.assertTrue(all(result[key] for key in ('docs', 'packages', 'generator', 'app', 'consistency')))
            self.assertEqual(len(result['expected']['scenario']), len(SCENARIOS))

    def test_full_events_need_no_file_listing(self):
        for event, payload in (
            ('pull_request', {'pull_request': {'head': {'ref': 'release-please--branches--main'}}}),
            ('pull_request', {'pull_request': {'changed_files': 3000}}),
            ('pull_request', {}),
            ('push', {'forced': True}),
            ('schedule', {}),
        ):
            with self.subTest(event=event, payload=payload), tempfile.TemporaryDirectory() as directory:
                event_file = Path(directory) / 'event'
                output = Path(directory) / 'output'
                event_file.write_text(json.dumps(payload))
                env = {'GITHUB_EVENT_NAME': event, 'GITHUB_EVENT_PATH': str(event_file),
                       'GITHUB_OUTPUT': str(output)}
                with patch.dict(os.environ, env), patch('changes.api') as api:
                    main()
                    api.assert_not_called()
                outputs = dict(line.split('=', 1) for line in output.read_text().splitlines())
                self.assertEqual(json.loads(outputs['expected'])['scenario'],
                                 [f'Generated app ({name})' for name in SCENARIOS])
                self.assertEqual(outputs['packages'], 'true')

    def test_required(self):
        expected = {'scenario': ['Generated app (bun)']}
        needs = {'scenario': {'result': 'success'}}
        jobs = [dict(name='Generated app (bun)', conclusion='success')]
        verify(expected, needs, jobs)
        for dependencies, records in [(needs, [dict(jobs[0], conclusion='cancelled', runner_id=None)]),
                                      ({'scenario': {'result': 'skipped'}}, []), ({}, jobs)]:
            with self.assertRaises(ValueError):
                verify(expected, dependencies, records)
