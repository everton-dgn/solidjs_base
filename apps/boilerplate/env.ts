import { serverEnv } from '@evertondgn/solid-runtime/env'
import * as v from 'valibot'

const env = {
  server: { ...serverEnv },
  client: {
    VITE_SITE_URL: v.pipe(v.string(), v.url())
  }
}

export default env
