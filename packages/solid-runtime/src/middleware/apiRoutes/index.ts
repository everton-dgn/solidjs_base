import { createAPIHandler } from 'filesystem-routing/api'
import routes from 'virtual:file-routes'

export const apiRoutes = createAPIHandler(routes)
