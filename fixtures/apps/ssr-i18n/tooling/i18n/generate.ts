import { compile } from '@inlang/paraglide-js'

import config from '../../project.inlang/paraglide.config.ts'

await compile({ project: './project.inlang', ...config })
