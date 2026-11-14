import { serverEnv } from '@evertondgn/solid-runtime/env'

const env = {
  server: { ...serverEnv, SCENARIO_LABEL: serverEnv.HOST },
  client: { VITE_SCENARIO_LABEL: serverEnv.HOST }
}

export default env
