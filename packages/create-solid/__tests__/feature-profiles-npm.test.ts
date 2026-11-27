import { describe, it } from 'node:test'

import { testProfiles } from './feature-profiles.ts'

void describe('npm profiles', () => testProfiles('npm', it))
