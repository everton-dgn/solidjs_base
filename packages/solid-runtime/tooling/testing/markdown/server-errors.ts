import { configureServerErrors } from '../../../src/infra/server/configureServerErrors/index.ts'

configureServerErrors({ publicMessage: locale => `Public error in ${locale}.` })
