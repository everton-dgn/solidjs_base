import { describe, it } from 'node:test'

import { testProfiles } from './feature-profiles.ts'

void describe('pnpm profiles', () => testProfiles('pnpm', it))
