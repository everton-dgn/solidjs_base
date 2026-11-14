import { buildRobotsText } from '../index.ts'

const SITEMAP = 'https://example.com/sitemap.xml'

describe('robots.txt generation', () => {
  it('publishes user agents, rules and sitemap with a blank line between groups', () => {
    const text = buildRobotsText({
      groups: [
        { userAgents: ['*'], allow: ['/'], disallow: ['/_server'] },
        { userAgents: ['GPTBot', 'CCBot'], disallow: ['/'] }
      ],
      sitemaps: [SITEMAP]
    })

    expect(text).toBe(
      [
        'User-agent: *',
        'Allow: /',
        'Disallow: /_server',
        '',
        'User-agent: GPTBot',
        'User-agent: CCBot',
        'Disallow: /',
        '',
        `Sitemap: ${SITEMAP}`,
        ''
      ].join('\n')
    )
  })

  it('lists one Sitemap directive per URL', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['*'], allow: ['/'] }],
      sitemaps: [SITEMAP, 'https://example.com/sitemap-noticias.xml']
    })

    expect(text).toBe(
      [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${SITEMAP}`,
        'Sitemap: https://example.com/sitemap-noticias.xml',
        ''
      ].join('\n')
    )
  })

  it('omits the sitemap section when no URL is provided', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['*'], disallow: ['/'] }],
      sitemaps: []
    })

    expect(text).toBe('User-agent: *\nDisallow: /\n')
  })

  it('publishes only user agents for groups without rules', () => {
    const text = buildRobotsText({
      groups: [{ userAgents: ['Googlebot'] }],
      sitemaps: []
    })

    expect(text).toBe('User-agent: Googlebot\n')
  })
})
