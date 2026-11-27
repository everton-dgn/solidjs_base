import { describe, it } from 'node:test'

import { testProfiles } from './feature-profiles.ts'

void describe('bun profiles', () => testProfiles('bun', it))
