import { env } from 'node:process'

import { type Browser, chromium } from 'playwright'

import { messageOf } from '../errorText/index.ts'

// The CI runner has the Chrome of the system, as in the browser tests of the
// runtime package; a machine runs the Chromium of Playwright.
export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch(env.CI ? { channel: 'chrome' } : {})
  } catch (error) {
    const fix = env.CI
      ? 'the CI runs them with the Chrome of the system, which did not start'
      : 'install Chromium with vp exec playwright install chromium'
    throw new Error(
      `The browser tests of the icons plugin cannot start a browser: ${fix}. ${messageOf(error)}`,
      { cause: error }
    )
  }
}
