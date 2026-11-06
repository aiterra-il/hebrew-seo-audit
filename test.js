import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditUrl, checkPage, isBlocked, parsePage, parseRobots, scoreOf } from './index.js'
import { htmlReport } from './report.js'

const LIVE = process.env.LIVE === '1'

const goodHtml = `<!doctype html><html lang="he" dir="rtl"><head>
<title>בניית אתרים לעסקים קטנים בישראל | סטודיו לדוגמה</title>
<meta name="description" content="בונים אתרים מהירים ונגישים לעסקים קטנים בישראל, עם עברית תקינה מימין לשמאל, קידום אורגני ותמיכה מלאה אחרי ההשקה.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="סטודיו לדוגמה"><meta property="og:image" content="https://example.co.il/og.png">
<link rel="canonical" href="https://example.co.il/">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"דוגמה"}</script>
</head><body><h1>בניית אתרים</h1><img src="a.png" alt="לוגו"><p>שלום עולם, זה אתר בעברית.</p>
<a href="/accessibility">הצהרת נגישות</a></body></html>`

const context = { url: 'https://example.co.il/', finalUrl: 'https://example.co.il/', status: 200 }

const withoutStatement = (html) => html.replace('הצהרת נגישות', 'צור קשר').replace('/accessibility', '/contact')

test('a clean Hebrew page passes every check', () => {
  const checks = checkPage(parsePage(goodHtml), context)
  assert.deepEqual(
    checks.filter((check) => check.status !== 'pass').map((check) => check.id),
    ['robots-txt'],
  )
})

test('missing rtl, h1 and accessibility statement are reported', () => {
  const html = withoutStatement(goodHtml).replace(' dir="rtl"', '').replace('<h1>בניית אתרים</h1>', '')
  const byId = Object.fromEntries(checkPage(parsePage(html), context).map((check) => [check.id, check.status]))
  assert.equal(byId.dir, 'warn')
  assert.equal(byId.h1, 'fail')
  assert.equal(byId['accessibility-statement'], 'fail')
})

test('dir on body counts as rtl', () => {
  const html = goodHtml.replace(' dir="rtl"', '').replace('<body>', '<body dir="rtl">')
  const check = checkPage(parsePage(html), context).find((item) => item.id === 'dir')
  assert.equal(check.status, 'pass')
})

test('an accessibility widget softens the statement check', () => {
  const html = withoutStatement(goodHtml).replace(
    '</body>',
    '<script src="https://cdn.userway.org/widget.js"></script></body>',
  )
  const check = checkPage(parsePage(html), context).find((item) => item.id === 'accessibility-statement')
  assert.equal(check.status, 'warn')
})

test('robots.txt wildcards follow Google rules', () => {
  const robots = parseRobots(
    [
      'User-agent: *',
      'Disallow: /*rmf=1$',
      'Disallow: /search',
      'Allow: /search/ok',
      '',
      'User-agent: GPTBot',
      'Disallow: /',
      'Sitemap: https://example.co.il/sitemap.xml',
    ].join('\n'),
  )
  assert.equal(isBlocked(robots, 'Googlebot', '/'), false)
  assert.equal(isBlocked(robots, 'Googlebot', '/p?rmf=1'), true)
  assert.equal(isBlocked(robots, 'Googlebot', '/p?rmf=12'), false)
  assert.equal(isBlocked(robots, 'Googlebot', '/search/ok/1'), false)
  assert.equal(isBlocked(robots, 'Googlebot', '/search/other'), true)
  assert.equal(isBlocked(robots, 'GPTBot', '/'), true)
  assert.equal(isBlocked(robots, 'ClaudeBot', '/'), false)
  assert.deepEqual(robots.sitemaps, ['https://example.co.il/sitemap.xml'])
})

test('blocked AI crawlers are flagged', () => {
  const robots = parseRobots(
    ['User-agent: GPTBot', 'Disallow: /', 'User-agent: *', 'Allow: /', 'Sitemap: https://example.co.il/s.xml'].join('\n'),
  )
  const check = checkPage(parsePage(goodHtml), { ...context, robots }).find((item) => item.id === 'ai-bots')
  assert.equal(check.status, 'warn')
  assert.match(check.messageEn, /GPTBot/)
})

test('score and Hebrew report', () => {
  const checks = checkPage(parsePage(goodHtml), context)
  assert.ok(scoreOf(checks) > 90)
  const html = htmlReport([{ url: context.url, finalUrl: context.url, status: 200, score: scoreOf(checks), checks }])
  assert.match(html, /<html lang="he" dir="rtl">/)
})

test('live audit', { skip: !LIVE }, async () => {
  const audit = await auditUrl('https://www.aiterra.co.il/')
  assert.equal(audit.status, 200)
  assert.ok(audit.score >= 90)
})
