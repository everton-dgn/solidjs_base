import { createRouter, memoryHistory, useNavigate } from '@solidjs/router'
import { POLL, readCanonical } from '@testing/seo/head-tags.ts'
import { SITE, LOCALE_TAG_OVERRIDES } from '@testing/seo/site.ts'

import { renderComponent } from '@/tests/renderComponent/index.tsx'

import { resolveRouteSeo } from '../../resolveRouteSeo/index.ts'
import { createSeo } from '../index.ts'

vi.mock(import('../../resolveRouteSeo/index.ts'), { spy: true })

const TWO_ROUTES = 2

describe('route SEO computation', () => {
  it('resolves metadata once per route instead of once per tag', async () => {
    let navigate: ReturnType<typeof useNavigate> | undefined
    const Router = createRouter({
      routes: [
        {
          path: '/*rest',
          component: () => {
            navigate = useNavigate()
            return null
          }
        }
      ],
      history: memoryHistory('/')
    })
    renderComponent(() => (
      <Router>
        {props => {
          createSeo({
            route: true,
            site: SITE,
            localeTagOverrides: LOCALE_TAG_OVERRIDES
          })
          return props.children
        }}
      </Router>
    ))
    await vi.waitUntil(() => readCanonical()?.endsWith('/de') === true, POLL)
    expect(resolveRouteSeo).toHaveBeenCalledOnce()
    assert(navigate)
    navigate('/docs')
    await vi.waitUntil(
      () => readCanonical()?.endsWith('/de/docs') === true,
      POLL
    )
    expect(resolveRouteSeo).toHaveBeenCalledTimes(TWO_ROUTES)
  })
})
