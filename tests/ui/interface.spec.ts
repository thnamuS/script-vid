import { test, expect } from '@playwright/test'

const article = { id: 'article-ui', sourceId: 'source-ui', title: 'Container demand rises as ports invest in capacity', source: 'Maritime Publication', url: 'https://example.com/news', publishedAt: '2026-10-10T08:00:00Z', createdAt: '2026-10-10T08:01:00Z', status: 'processed', content: 'The publisher reports that ports are investing in capacity. These developments are being monitored across the shipping industry.' }
const script = { id: 'script-ui', articleId: article.id, title: article.title, source: article.source, hook: 'What is changing for container shipping?', summary: 'A report on container demand and port investment.', keyPoints: ['Demand is changing.', 'Ports are investing.', 'Source attribution is required.'], format: 'video-ready-v1', status: 'generated', durationSeconds: 60, productionNotes: 'Use neutral narration and clearly labelled illustrative footage.', generatedAt: '2026-10-10T08:03:00Z', script: 'VIDEO CREATION BRIEF\nVOICEOVER: What is changing for container shipping?', scenes: Array.from({ length: 6 }, () => ({ durationSeconds: 10, narration: 'According to the publisher, ports are investing in capacity.', visuals: 'Illustrative container-port B-roll, slow pan in natural daylight.', onScreenText: 'Illustrative footage' })) }
const source = { id: 'source-ui', name: 'Maritime Publication', url: 'https://example.com/news', active: true, articleCount: 1, kind: 'website', lastCheckedAt: '2026-10-10T08:02:00Z', lastError: null }
const job = { id: 'job-ui', kind: 'pipeline', status: 'running', stage: 'scraping', currentItem: 'Maritime Publication', completed: 2, total: 6, articlesSaved: 2, scriptsGenerated: 0, issues: [], startedAt: '2026-10-10T08:00:00Z', updatedAt: '2026-10-10T08:01:00Z', finishedAt: null, error: null }

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const data: Record<string, unknown> = {
      '/api/health': { status: 'ok' }, '/api/providers': [{ id: 'openrouter', label: 'OpenRouter', model: 'openrouter/free', kind: 'script', configured: true, free: true }],
      '/api/sources': [source], '/api/articles': [article], '/api/scripts': [script], '/api/jobs': [],
      '/api/articles/article-ui': article, '/api/scripts/script-ui': script,
    }
    if (path === '/api/articles/article-ui/generate') {
      const body = route.request().postDataJSON()
      expect(body.regenerate).toBe(true)
      expect(body.feedback).toContain('Stronger hook')
      await route.fulfill({ json: { ...script, hook: 'An improved shipping hook' } })
    } else await route.fulfill({ json: data[path] || {} })
  })
})

test('plain navigation, live progress, and responsive layout', async ({ page }) => {
  await page.route('**/api/jobs', route => route.fulfill({ json: [job] }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible()
  await expect(page.getByText('In progress', { exact: true })).toBeVisible()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '33')
  await expect(page.getByRole('button', { name: 'Pipeline running' })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'ShippingShorts', exact: true })).toHaveCount(1)
  await expect(page.getByText('Workspace', { exact: true })).toHaveCount(0)
  const mobile = (page.viewportSize()?.width || 0) < 1024
  if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Articles', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Articles', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: article.title })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (mobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
  }
})

test('source filters and accessible add dialog', async ({ page }) => {
  await page.goto('/sources')
  await page.getByRole('button', { name: 'Add source', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Publication name' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('button', { name: 'paused', exact: true }).click()
  await expect(page.getByText('No sources here yet')).toBeVisible()
  await page.getByRole('button', { name: 'all', exact: true }).click()
  await expect(page.getByText(source.name, { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('script and article stars persist, synchronize, and filter both views', async ({ page }) => {
  let starred = false
  await page.route('**/api/scripts', route => route.fulfill({ json: [{ ...script, starred }] }))
  await page.route('**/api/scripts/script-ui', async route => {
    if (route.request().method() === 'PATCH') starred = route.request().postDataJSON().starred
    await route.fulfill({ json: { ...script, starred } })
  })
  await page.route('**/api/articles', route => route.fulfill({ json: [{ ...article, starred }] }))
  await page.route('**/api/articles/article-ui', async route => {
    if (route.request().method() === 'PATCH') starred = route.request().postDataJSON().starred
    await route.fulfill({ json: { ...article, starred } })
  })
  await page.goto('/scripts')
  const star = page.getByRole('button', { name: `Star script: ${script.title}`, exact: true })
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  const card = page.locator('article').filter({ has: star })
  const cardBox = await card.boundingBox()
  const starBox = await star.boundingBox()
  expect(Math.abs((starBox!.x + starBox!.width / 2) - (cardBox!.x + cardBox!.width / 2))).toBeLessThan(2)
  expect(starBox!.y - cardBox!.y).toBeLessThan(30)
  await star.click()
  expect(new URL(page.url()).pathname).toBe('/scripts')
  await expect(page.getByRole('button', { name: `Unstar script: ${script.title}` })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: `Unstar script: ${script.title}` }).locator('svg')).toHaveClass(/fill-yellow-400/)
  await page.reload()
  await page.getByRole('button', { name: 'Starred', exact: true }).click()
  await expect(page.getByRole('heading', { name: script.title })).toBeVisible()
  await page.goto('/articles')
  await page.getByRole('button', { name: /^starred/i }).click()
  const articleStar = page.getByRole('button', { name: `Unstar article: ${article.title}`, exact: true })
  await expect(articleStar).toHaveAttribute('aria-pressed', 'true')
  await expect(articleStar.locator('svg')).toHaveClass(/fill-yellow-400/)
  const arrowBox = await page.locator(`a[href="/articles/${article.id}"] svg:visible`).last().boundingBox()
  const articleStarBox = await articleStar.boundingBox()
  expect(articleStarBox!.x + articleStarBox!.width).toBeLessThan(arrowBox!.x)
  const filterNames = await page.getByRole('group', { name: 'Filter articles' }).getByRole('button').allTextContents()
  expect(filterNames.map(name => name.replace(/\d/g, '').trim())).toEqual(['all', 'new', 'processed', 'failed', 'starred'])
  await articleStar.click()
  expect(new URL(page.url()).pathname).toBe('/articles')
  await expect(page.getByText('No starred articles', { exact: true })).toBeVisible()
  await page.goto('/scripts')
  await page.getByRole('button', { name: `Star script: ${script.title}` }).click()
  await page.getByRole('button', { name: 'Starred', exact: true }).click()
  await page.getByRole('button', { name: `Unstar script: ${script.title}` }).click()
  await expect(page.getByText('No starred scripts', { exact: true })).toBeVisible()
  await page.goto('/articles')
  await page.getByRole('button', { name: /^starred/i }).click()
  await expect(page.getByText('No starred articles', { exact: true })).toBeVisible()
})

test('failed star saves leave the icon unchanged and show an error', async ({ page }) => {
  await page.route('**/api/scripts/script-ui', route => route.fulfill({ status: 503, json: { detail: 'Could not save the star' } }))
  await page.goto('/scripts')
  const star = page.getByRole('button', { name: `Star script: ${script.title}`, exact: true })
  await star.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Could not save the star' })).toBeVisible()
  await expect(star).toHaveAttribute('aria-pressed', 'false')
  await expect(star).toBeEnabled()
})

test('scene review and feedback-based revision without paid calls', async ({ page }) => {
  await page.goto('/scripts/script-ui')
  await expect(page.getByRole('heading', { name: 'Scene 01' })).toBeVisible()
  await page.getByRole('button', { name: 'Full script', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Complete creation brief' })).toBeVisible()
  await page.getByRole('button', { name: 'Stronger hook', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Feedback' })).toHaveValue('Stronger hook.')
  page.on('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Regenerate script', exact: true }).click()
  await expect(page.getByText('An improved shipping hook')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'New version saved' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
