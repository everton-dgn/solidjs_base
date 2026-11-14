export const ROBOTS = {
  sitemapPaths: ['/sitemap.xml'],
  groups: [
    {
      userAgents: [
        'GPTBot',
        'ClaudeBot',
        'anthropic-ai',
        'CCBot',
        'Google-Extended',
        'Applebot-Extended',
        'meta-externalagent',
        'Bytespider'
      ],
      disallow: ['/']
    }
  ]
}
