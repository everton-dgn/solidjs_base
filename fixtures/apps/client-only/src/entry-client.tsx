import { createRouter } from '@solidjs/router'
import { render } from '@solidjs/web'

import App from './App.tsx'

const Router = createRouter({ routes: [{ path: '*all', component: App }] })

render(() => <Router>{props => props.children}</Router>, document.body)
