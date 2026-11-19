import unittest
from changes import classify, SCENARIOS
from required import verify


class Jobs(unittest.TestCase):
    def test_routes(self):
        for path, enabled in (
            ('docs/tooling/no-server.md', ['docs']),
            ('packages/solid-runtime/README.md', ['docs']),
            ('apps/boilerplate/fonts.ts', ['app', 'generator']),
            ('packages/create-solid/docs/install.md', ['docs', 'generator']),
            ('packages/solid-runtime/src/index.ts', ['app', 'docs', 'packages', 'generator']),
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
                            ('pull_request', dict(release=True)), ('schedule', {})]:
            result = classify(event, [], **args)
            self.assertTrue(all(result[key] for key in ('docs', 'packages', 'generator', 'app', 'consistency')))
            self.assertEqual(len(result['expected']['scenario']), len(SCENARIOS))

    def test_required(self):
        expected = {'scenario': ['Generated app (bun)']}
        needs = {'scenario': {'result': 'success'}}
        jobs = [dict(name='Generated app (bun)', conclusion='success')]
        verify(expected, needs, jobs)
        for dependencies, records in [(needs, [dict(jobs[0], conclusion='cancelled', runner_id=None)]),
                                      ({'scenario': {'result': 'skipped'}}, []), ({}, jobs)]:
            with self.assertRaises(ValueError):
                verify(expected, dependencies, records)
