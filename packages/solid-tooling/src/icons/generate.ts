import { argv } from 'node:process'

import { generateIconTypes } from './generateIconTypes/index.ts'

await generateIconTypes(argv[2])
