export const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Bingbot']

const USER_AGENT = 'hebrew-seo-audit/1.0 (+https://github.com/aiterra-il/hebrew-seo-audit)'
const DEFAULT_TIMEOUT_MS = 20000
const HEBREW = /[א-ת]/g
const LETTER = /\p{L}/gu

export const LIMITS = {
  titleMin: 25,
  titleMax: 60,
  descriptionMin: 70,
  descriptionMax: 160,
}

const decodeEntities = (value) =>
  String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

const attributesOf = (tag) => {
  const attributes = {}
  for (const match of tag.matchAll(/([^\s=<>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase()
    if (name === tag.slice(1).split(/[\s>/]/)[0].toLowerCase()) continue
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return attributes
}

const tagsOf = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => attributesOf(match[0]))

const innerTextOf = (html, name) =>
  [...html.matchAll(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'gi'))].map((match) =>
    decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
  )

const visibleText = (html) =>
  decodeEntities(
    html
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()

export function parsePage(html) {
  const head = /<head\b[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html
  const htmlTag = /<html\b[^>]*>/i.exec(html)?.[0]
  const bodyTag = /<body\b[^>]*>/i.exec(html)?.[0]
  const meta = tagsOf(head, 'meta')
  const links = tagsOf(head, 'link')
  const metaContent = (key, value) =>
    meta.find((item) => (item[key] ?? '').toLowerCase() === value.toLowerCase())?.content ?? null
  const text = visibleText(html)
  const letters = text.match(LETTER)?.length ?? 0
  const hebrew = text.match(HEBREW)?.length ?? 0
  const jsonLd = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map(
    (match) => {
      try {
        return { ok: true, data: JSON.parse(match[1]) }
      } catch (error) {
        return { ok: false, error: error.message }
      }
    },
  )
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: attributesOf(`<a ${match[1]}>`).href ?? '',
    text: decodeEntities(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
  }))
  return {
    lang: htmlTag ? attributesOf(htmlTag).lang ?? null : null,
    dir: htmlTag ? attributesOf(htmlTag).dir ?? null : null,
    bodyDir: bodyTag ? attributesOf(bodyTag).dir ?? null : null,
    title: innerTextOf(head, 'title')[0] ?? null,
    description: metaContent('name', 'description'),
    robots: metaContent('name', 'robots'),
    viewport: metaContent('name', 'viewport'),
    ogTitle: metaContent('property', 'og:title'),
    ogImage: metaContent('property', 'og:image'),
    ogLocale: metaContent('property', 'og:locale'),
    canonical: links.find((item) => (item.rel ?? '').toLowerCase() === 'canonical')?.href ?? null,
    hreflang: links
      .filter((item) => (item.rel ?? '').toLowerCase() === 'alternate' && item.hreflang)
      .map((item) => ({ lang: item.hreflang, href: item.href })),
    h1: innerTextOf(html, 'h1'),
    images: tagsOf(html, 'img'),
    jsonLd,
    anchors,
    mentionsStatement: ACCESSIBILITY_TEXT.test(text),
    accessibilityWidget: ACCESSIBILITY_WIDGET.test(html),
    hebrewShare: letters ? hebrew / letters : 0,
    words: text ? text.split(' ').length : 0,
  }
}

const schemaTypes = (jsonLd) => {
  const types = new Set()
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const type = node['@type']
    for (const item of Array.isArray(type) ? type : [type]) if (item) types.add(String(item))
    Object.values(node).forEach(visit)
  }
  jsonLd.filter((item) => item.ok).forEach((item) => visit(item.data))
  return [...types]
}

export function parseRobots(text) {
  const groups = []
  let current = null
  const sitemaps = []
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const match = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (key === 'sitemap') {
      sitemaps.push(value)
    } else if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.rules.push({ type: key, path: value })
    }
  }
  return { groups, sitemaps }
}

const robotsPattern = (rulePath) => {
  const anchored = rulePath.endsWith('$')
  const body = (anchored ? rulePath.slice(0, -1) : rulePath)
    .split('*')
    .map((part) => part.replace(/[.+?^{}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`)
}

export function isBlocked(robots, agent, path = '/') {
  const name = agent.toLowerCase()
  const group =
    robots.groups.find((item) => item.agents.some((value) => value !== '*' && name.includes(value))) ??
    robots.groups.find((item) => item.agents.includes('*'))
  if (!group) return false
  const matching = group.rules
    .filter((rule) => rule.path && robotsPattern(rule.path).test(path))
    .sort((a, b) => b.path.length - a.path.length || (a.type === 'allow' ? -1 : 1))
  return matching[0]?.type === 'disallow'
}

const ACCESSIBILITY_TEXT = /הצהרת\s*(ה)?נגישות|accessibility\s*statement/i
const ACCESSIBILITY_HREF = /accessib|negishut|nagishut|%D7%A0%D7%92%D7%99%D7%A9%D7%95%D7%AA/i
const ACCESSIBILITY_WIDGET = /nagich|userway|enable\.co\.il|equalweb|accessibe|acsbapp|sienna|accessibility-widget|onetap/i

const result = (id, status, he, en, detail = '') => ({ id, status, message: he, messageEn: en, detail })

export function checkPage(page, context = {}) {
  const { url, finalUrl = url, status = 200, headers = {}, robots = null, llmsTxt = null } = context
  const checks = []
  const isHebrewPage = page.hebrewShare >= 0.3 || (page.lang ?? '').toLowerCase().startsWith('he')

  checks.push(
    status >= 200 && status < 300
      ? result('status', 'pass', `HTTP ${status}`, `HTTP ${status}`)
      : result('status', 'fail', `העמוד החזיר HTTP ${status}`, `The page returned HTTP ${status}`),
  )
  if (url && finalUrl && url !== finalUrl) {
    checks.push(result('redirect', 'info', 'הכתובת מפנה לכתובת אחרת', 'The URL redirects', finalUrl))
  }
  if (finalUrl && !finalUrl.startsWith('https://')) {
    checks.push(result('https', 'fail', 'העמוד לא נטען ב-HTTPS', 'The page is not served over HTTPS'))
  }

  if (isHebrewPage) {
    const lang = (page.lang ?? '').toLowerCase()
    checks.push(
      lang.startsWith('he')
        ? result('lang', 'pass', `lang="${page.lang}"`, `lang="${page.lang}"`)
        : result(
            'lang',
            'fail',
            'העמוד בעברית אבל חסר lang="he" בתגית html',
            'Hebrew page without lang="he" on the html tag',
            page.lang ? `lang="${page.lang}"` : '',
          ),
    )
    checks.push(
      (page.dir ?? '').toLowerCase() === 'rtl' || (page.bodyDir ?? '').toLowerCase() === 'rtl'
        ? result('dir', 'pass', 'dir="rtl"', 'dir="rtl"')
        : result(
            'dir',
            'warn',
            'העמוד בעברית אבל חסר dir="rtl" בתגית html. כיוון שנקבע רק ב-CSS לא עוזר לקוראי מסך ולטקסט מעורב עברית-אנגלית',
            'Hebrew page without dir="rtl" on the html tag. Direction set only in CSS does not help screen readers or mixed Hebrew-English text',
          ),
    )
  }

  if (!page.title) {
    checks.push(result('title', 'fail', 'אין תגית title', 'Missing title tag'))
  } else if (page.title.length < LIMITS.titleMin || page.title.length > LIMITS.titleMax) {
    checks.push(
      result(
        'title',
        'warn',
        `אורך הכותרת ${page.title.length} תווים, מומלץ ${LIMITS.titleMin} עד ${LIMITS.titleMax}`,
        `Title is ${page.title.length} characters, aim for ${LIMITS.titleMin} to ${LIMITS.titleMax}`,
        page.title,
      ),
    )
  } else {
    checks.push(result('title', 'pass', `כותרת באורך ${page.title.length} תווים`, `Title is ${page.title.length} characters`, page.title))
  }

  if (!page.description) {
    checks.push(result('description', 'fail', 'אין meta description', 'Missing meta description'))
  } else if (page.description.length < LIMITS.descriptionMin || page.description.length > LIMITS.descriptionMax) {
    checks.push(
      result(
        'description',
        'warn',
        `אורך התיאור ${page.description.length} תווים, מומלץ ${LIMITS.descriptionMin} עד ${LIMITS.descriptionMax}`,
        `Description is ${page.description.length} characters, aim for ${LIMITS.descriptionMin} to ${LIMITS.descriptionMax}`,
        page.description,
      ),
    )
  } else {
    checks.push(
      result(
        'description',
        'pass',
        `תיאור באורך ${page.description.length} תווים`,
        `Description is ${page.description.length} characters`,
        page.description,
      ),
    )
  }

  if (page.h1.length === 1) checks.push(result('h1', 'pass', 'כותרת H1 אחת', 'One H1', page.h1[0]))
  else if (page.h1.length === 0) checks.push(result('h1', 'fail', 'אין כותרת H1', 'Missing H1'))
  else {
    checks.push(
      result('h1', 'warn', `יש ${page.h1.length} כותרות H1, מומלץ אחת`, `${page.h1.length} H1 headings, use one`, page.h1.join(' | ')),
    )
  }

  if (!page.canonical) {
    checks.push(result('canonical', 'warn', 'אין קישור canonical', 'Missing canonical link'))
  } else if (!/^https?:\/\//i.test(page.canonical)) {
    checks.push(result('canonical', 'warn', 'כתובת ה-canonical לא מלאה', 'Canonical is not an absolute URL', page.canonical))
  } else if (finalUrl && new URL(page.canonical).href !== new URL(finalUrl).href) {
    checks.push(result('canonical', 'warn', 'ה-canonical מצביע על כתובת אחרת', 'Canonical points to a different URL', page.canonical))
  } else {
    checks.push(result('canonical', 'pass', 'canonical תקין', 'Canonical points to this page', page.canonical))
  }

  if (page.hreflang.length) {
    const sameUrl = (href) => {
      try {
        return new URL(href, finalUrl).href === new URL(finalUrl).href
      } catch {
        return false
      }
    }
    const selfListed = Boolean(finalUrl) && page.hreflang.some((item) => sameUrl(item.href))
    const hasDefault = page.hreflang.some((item) => item.lang.toLowerCase() === 'x-default')
    const languages = page.hreflang.map((item) => item.lang).join(', ')
    if (selfListed && hasDefault) {
      checks.push(result('hreflang', 'pass', `hreflang: ${languages}`, `hreflang: ${languages}`))
    } else {
      const he = [selfListed ? '' : 'העמוד לא מופיע ב-hreflang של עצמו', hasDefault ? '' : 'חסר x-default'].filter(Boolean).join(', ')
      const en = [selfListed ? '' : 'the page is not in its own hreflang set', hasDefault ? '' : 'no x-default'].filter(Boolean).join(', ')
      checks.push(result('hreflang', 'warn', he, `hreflang: ${en}`, languages))
    }
  }

  if (/noindex/i.test(page.robots ?? '') || /noindex/i.test(headers['x-robots-tag'] ?? '')) {
    checks.push(result('noindex', 'fail', 'העמוד חסום לאינדוקס (noindex)', 'The page is set to noindex'))
  }

  if (!page.viewport) {
    checks.push(
      result('viewport', 'fail', 'אין meta viewport, העמוד לא יוצג נכון בנייד', 'Missing meta viewport, the page will not render well on phones'),
    )
  }

  const ogMissing = [!page.ogTitle && 'og:title', !page.ogImage && 'og:image'].filter(Boolean)
  checks.push(
    ogMissing.length
      ? result(
          'open-graph',
          'warn',
          `חסר ${ogMissing.join(' ו-')}, השיתוף בוואטסאפ ובפייסבוק ייראה ריק`,
          `Missing ${ogMissing.join(' and ')}, shares on WhatsApp and Facebook will look empty`,
        )
      : result('open-graph', 'pass', 'Open Graph קיים', 'Open Graph tags present'),
  )
  if (isHebrewPage && page.ogLocale && !/^(he|iw)/i.test(page.ogLocale)) {
    checks.push(result('og-locale', 'warn', `og:locale הוא ${page.ogLocale} ולא he_IL`, `og:locale is ${page.ogLocale}, not he_IL`))
  }

  const brokenJsonLd = page.jsonLd.filter((item) => !item.ok)
  const types = schemaTypes(page.jsonLd)
  if (brokenJsonLd.length) {
    checks.push(
      result(
        'json-ld',
        'fail',
        `${brokenJsonLd.length} בלוקים של JSON-LD לא תקינים`,
        `${brokenJsonLd.length} invalid JSON-LD blocks`,
        brokenJsonLd[0].error,
      ),
    )
  } else if (!page.jsonLd.length) {
    checks.push(result('json-ld', 'warn', 'אין נתונים מובנים (JSON-LD)', 'No structured data (JSON-LD)'))
  } else {
    checks.push(result('json-ld', 'pass', `נתונים מובנים: ${types.join(', ')}`, `Structured data: ${types.join(', ')}`))
  }

  if (page.images.length) {
    const missingAlt = page.images.filter((image) => image.alt === undefined).length
    checks.push(
      missingAlt
        ? result(
            'alt',
            'warn',
            `${missingAlt} מתוך ${page.images.length} תמונות בלי alt`,
            `${missingAlt} of ${page.images.length} images have no alt`,
          )
        : result('alt', 'pass', `לכל ${page.images.length} התמונות יש alt`, `All ${page.images.length} images have alt`),
    )
  }

  if (isHebrewPage) {
    const statement =
      page.mentionsStatement ||
      page.anchors.some((anchor) => ACCESSIBILITY_TEXT.test(anchor.text) || ACCESSIBILITY_HREF.test(anchor.href))
    checks.push(
      statement
        ? result('accessibility-statement', 'pass', 'יש הצהרת נגישות', 'Has an accessibility statement')
        : page.accessibilityWidget
        ? result(
            'accessibility-statement',
            'warn',
            'יש תוסף נגישות, אבל הצהרת הנגישות לא מופיעה ב-HTML. בדקו שהיא נפתחת מהתוסף',
            'An accessibility widget is installed but the statement is not in the HTML, check that the widget shows it',
          )
        : result(
            'accessibility-statement',
            'fail',
            'לא נמצא קישור להצהרת נגישות, שתקנה 35ה לתקנות הנגישות מחייבת לפרסם',
            'No link to an accessibility statement, which Israeli accessibility regulation 35E requires',
            'https://www.aiterra.co.il/tools/accessibility-statement-generator',
          ),
    )
  }

  if (robots) {
    const path = finalUrl ? new URL(finalUrl).pathname : '/'
    if (isBlocked(robots, 'Googlebot', path)) {
      checks.push(
        result('robots-google', 'fail', 'robots.txt חוסם את Googlebot לעמוד הזה', 'robots.txt blocks Googlebot from this page'),
      )
    }
    const blockedBots = AI_BOTS.filter((bot) => isBlocked(robots, bot, path))
    checks.push(
      blockedBots.length
        ? result(
            'ai-bots',
            'warn',
            `robots.txt חוסם בוטים של מנועי AI: ${blockedBots.join(', ')}`,
            `robots.txt blocks AI crawlers: ${blockedBots.join(', ')}`,
            'ChatGPT, Claude, Perplexity, Copilot',
          )
        : result('ai-bots', 'pass', 'robots.txt פתוח לבוטים של מנועי AI', 'robots.txt allows AI crawlers'),
    )
    checks.push(
      robots.sitemaps.length
        ? result('sitemap', 'pass', 'יש Sitemap ב-robots.txt', 'robots.txt lists a sitemap', robots.sitemaps[0])
        : result('sitemap', 'warn', 'אין שורת Sitemap ב-robots.txt', 'robots.txt does not list a sitemap'),
    )
  } else {
    checks.push(result('robots-txt', 'warn', 'לא נמצא robots.txt', 'No robots.txt found'))
  }

  if (llmsTxt !== null) {
    checks.push(
      llmsTxt
        ? result('llms-txt', 'pass', 'יש קובץ llms.txt', 'llms.txt present')
        : result('llms-txt', 'info', 'אין קובץ llms.txt', 'No llms.txt', 'https://llmstxt.org'),
    )
  }

  return checks
}

export function scoreOf(checks) {
  const weights = { pass: 1, info: 1, warn: 0.5, fail: 0 }
  const counted = checks.filter((check) => check.status in weights)
  if (!counted.length) return 0
  return Math.round((counted.reduce((sum, check) => sum + weights[check.status], 0) / counted.length) * 100)
}

const withTimeout = (signal, timeoutMs) => {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

const fetchText = async (url, { signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetch: fetcher = globalThis.fetch } = {}) => {
  const response = await fetcher(url, {
    redirect: 'follow',
    signal: withTimeout(signal, timeoutMs),
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8' },
  })
  const headers = Object.fromEntries([...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]))
  return { status: response.status, finalUrl: response.url || url, headers, text: await response.text() }
}

export async function auditUrl(input, options = {}) {
  const url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`).href
  const page = await fetchText(url, options)
  const origin = new URL(page.finalUrl).origin
  const [robotsResponse, llmsResponse] = await Promise.all([
    fetchText(`${origin}/robots.txt`, options).catch(() => null),
    fetchText(`${origin}/llms.txt`, options).catch(() => null),
  ])
  const robots = robotsResponse && robotsResponse.status === 200 ? parseRobots(robotsResponse.text) : null
  const llmsTxt = llmsResponse ? llmsResponse.status === 200 && llmsResponse.text.trim().length > 0 : null
  if (page.status < 200 || page.status >= 300) {
    const blocked = page.status === 403 || page.status === 429 || page.status === 503
    const checks = [
      result(
        'status',
        'fail',
        blocked ? `האתר חסם את הבדיקה (HTTP ${page.status}), כנראה חומת אש כמו Cloudflare` : `העמוד החזיר HTTP ${page.status}`,
        blocked
          ? `The site blocked the audit (HTTP ${page.status}), probably a firewall such as Cloudflare`
          : `The page returned HTTP ${page.status}`,
      ),
    ]
    return { url, finalUrl: page.finalUrl, status: page.status, score: 0, checks, page: null }
  }
  const parsed = parsePage(page.text)
  const checks = checkPage(parsed, {
    url,
    finalUrl: page.finalUrl,
    status: page.status,
    headers: page.headers,
    robots,
    llmsTxt,
  })
  return { url, finalUrl: page.finalUrl, status: page.status, score: scoreOf(checks), checks, page: parsed }
}

export async function sitemapUrls(sitemapUrl, options = {}) {
  const { limit = 50 } = options
  const seen = new Set()
  const pages = []
  const queue = [sitemapUrl]
  while (queue.length && pages.length < limit) {
    const next = queue.shift()
    if (seen.has(next)) continue
    seen.add(next)
    const response = await fetchText(next, options).catch(() => null)
    if (!response || response.status !== 200) continue
    const locations = [...response.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((match) => decodeEntities(match[1]))
    if (/<sitemapindex\b/i.test(response.text)) queue.push(...locations)
    else pages.push(...locations)
  }
  return pages.slice(0, limit)
}
