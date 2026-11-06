#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import { auditUrl, sitemapUrls } from './index.js'
import { htmlReport } from './report.js'

const HELP = `hebrew-seo-audit: SEO and GEO checks for Hebrew and Israeli websites

Usage
  npx hebrew-seo-audit <url> [more urls] [options]

Options
  --sitemap <url>     audit the pages listed in a sitemap
  --limit <n>         how many sitemap pages to audit (default 20)
  --html <file>       write a Hebrew RTL report to an HTML file
  --json              print the results as JSON
  --lang he           print messages in Hebrew (default English, most terminals reverse Hebrew)
  --fail-under <n>    exit with code 1 when a page scores below n, for CI
  -h, --help          show this help

Examples
  npx hebrew-seo-audit www.example.co.il
  npx hebrew-seo-audit --sitemap https://www.example.co.il/sitemap.xml --html report.html
`

const parseArgs = (argv) => {
  const options = { urls: [], limit: 20, lang: 'en' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const value = () => argv[(index += 1)]
    if (arg === '-h' || arg === '--help') options.help = true
    else if (arg === '--json') options.json = true
    else if (arg === '--sitemap') options.sitemap = value()
    else if (arg === '--limit') options.limit = Number(value())
    else if (arg === '--html') options.html = value()
    else if (arg === '--lang') options.lang = value()
    else if (arg === '--fail-under') options.failUnder = Number(value())
    else options.urls.push(arg)
  }
  return options
}

const color = process.stdout.isTTY && !process.env.NO_COLOR
const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text)
const marks = {
  pass: paint('32', '✔'),
  warn: paint('33', '!'),
  fail: paint('31', '✘'),
  info: paint('36', 'i'),
}

const printAudit = (audit, lang) => {
  const scoreColor = audit.score >= 90 ? '32' : audit.score >= 60 ? '33' : '31'
  console.log(`\n${paint('1', audit.finalUrl)}  ${paint(scoreColor, `${audit.score}/100`)}`)
  const order = { fail: 0, warn: 1, info: 2, pass: 3 }
  for (const check of [...audit.checks].sort((a, b) => order[a.status] - order[b.status])) {
    const message = lang === 'he' ? check.message : check.messageEn
    console.log(`  ${marks[check.status]} ${message}`)
    if (check.detail && check.status !== 'pass') console.log(`    ${paint('2', check.detail)}`)
  }
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2))
  if (options.help || (!options.urls.length && !options.sitemap)) {
    console.log(HELP)
    process.exit(options.help ? 0 : 1)
  }
  const urls = [...options.urls]
  if (options.sitemap) urls.push(...(await sitemapUrls(options.sitemap, { limit: options.limit })))
  if (!urls.length) {
    console.error('No URLs to audit. Check the sitemap address.')
    process.exit(1)
  }
  const audits = []
  for (const url of urls) {
    try {
      const audit = await auditUrl(url)
      audits.push(audit)
      if (!options.json) printAudit(audit, options.lang)
    } catch (error) {
      const failed = {
        url,
        finalUrl: url,
        status: 0,
        score: 0,
        checks: [{ id: 'fetch', status: 'fail', message: `לא הצלחנו לטעון את העמוד: ${error.message}`, messageEn: `Could not load the page: ${error.message}`, detail: '' }],
      }
      audits.push(failed)
      if (!options.json) printAudit(failed, options.lang)
    }
  }
  if (options.json) console.log(JSON.stringify(audits.map(({ page, ...audit }) => audit), null, 2))
  if (options.html) {
    await writeFile(options.html, htmlReport(audits), 'utf8')
    if (!options.json) console.log(`\nReport saved to ${options.html}`)
  }
  if (!options.json && audits.length > 1) {
    const average = Math.round(audits.reduce((sum, audit) => sum + audit.score, 0) / audits.length)
    console.log(`\nAverage score: ${average}/100 across ${audits.length} pages`)
  }
  if (Number.isFinite(options.failUnder) && audits.some((audit) => audit.score < options.failUnder)) process.exit(1)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
