const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const statusLabel = { pass: 'תקין', warn: 'לשיפור', fail: 'לתיקון', info: 'מידע' }

const scoreClass = (score) => (score >= 90 ? 'good' : score >= 60 ? 'ok' : 'bad')

const detailHtml = (detail) =>
  /^https?:\/\//.test(detail)
    ? `<a href="${escapeHtml(detail)}" dir="ltr">${escapeHtml(detail)}</a>`
    : `<bdi>${escapeHtml(detail)}</bdi>`

const pageSection = (audit) => {
  const order = { fail: 0, warn: 1, info: 2, pass: 3 }
  const rows = [...audit.checks]
    .sort((a, b) => order[a.status] - order[b.status])
    .map(
      (check) => `
        <li class="check ${check.status}">
          <span class="badge">${statusLabel[check.status]}</span>
          <div>
            <p dir="auto">${escapeHtml(check.message)}</p>
            ${check.detail ? `<p class="detail">${detailHtml(check.detail)}</p>` : ''}
          </div>
        </li>`,
    )
    .join('')
  return `
    <section class="page">
      <header>
        <div class="score ${scoreClass(audit.score)}"><strong>${audit.score}</strong><span>מתוך 100</span></div>
        <div>
          <h2><a href="${escapeHtml(audit.finalUrl)}" dir="ltr">${escapeHtml(audit.finalUrl)}</a></h2>
          <p class="counts">${['fail', 'warn', 'pass']
            .map((status) => `${audit.checks.filter((check) => check.status === status).length} ${statusLabel[status]}`)
            .join(' · ')}</p>
        </div>
      </header>
      <ul>${rows}</ul>
    </section>`
}

export function htmlReport(audits, generatedAt = new Date()) {
  const average = Math.round(audits.reduce((sum, audit) => sum + audit.score, 0) / Math.max(audits.length, 1))
  const date = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jerusalem' }).format(
    generatedAt,
  )
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>דוח SEO · hebrew-seo-audit</title>
<style>
  :root { --ink: #060B22; --muted: #5b6275; --line: #e3e6ef; --bg: #f6f7fb; --card: #fff; --brand: #2447D6; --good: #13834a; --ok: #b26a00; --bad: #c42b2b; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Heebo", "Rubik", "Segoe UI", Arial, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.6; }
  .wrap { max-width: 900px; margin: 0 auto; padding: 32px 16px 64px; }
  .top { background: var(--ink); color: #fff; padding: 32px 16px; }
  .top .wrap { padding: 0 16px; }
  .top h1 { margin: 0 0 4px; font-size: 28px; }
  .top p { margin: 0; color: #c9cfe3; }
  .summary { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
  .summary div { background: rgba(255,255,255,.08); border-radius: 12px; padding: 10px 16px; }
  .summary strong { font-size: 22px; display: block; }
  .page { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 20px; margin-top: 20px; }
  .page header { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; }
  .page h2 { margin: 0; font-size: 16px; word-break: break-all; }
  .page h2 a { color: var(--ink); }
  .counts { margin: 2px 0 0; color: var(--muted); font-size: 14px; }
  .score { flex: none; width: 76px; height: 76px; border-radius: 50%; display: grid; place-content: center; text-align: center; border: 4px solid; }
  .score strong { font-size: 24px; line-height: 1; }
  .score span { font-size: 11px; color: var(--muted); }
  .score.good { border-color: var(--good); color: var(--good); }
  .score.ok { border-color: var(--ok); color: var(--ok); }
  .score.bad { border-color: var(--bad); color: var(--bad); }
  ul { list-style: none; margin: 0; padding: 0; }
  .check { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
  .check p { margin: 0; text-align: right; }
  .check .detail { color: var(--muted); font-size: 14px; word-break: break-word; }
  .badge { flex: none; font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 999px; height: fit-content; }
  .pass .badge { background: #e3f4ea; color: var(--good); }
  .warn .badge { background: #fff1dc; color: var(--ok); }
  .fail .badge { background: #fde5e5; color: var(--bad); }
  .info .badge { background: #e8ecfb; color: var(--brand); }
  a { color: var(--brand); }
  footer { margin-top: 32px; color: var(--muted); font-size: 14px; text-align: center; }
</style>
</head>
<body>
  <div class="top"><div class="wrap">
    <h1>דוח SEO לאתר בעברית</h1>
    <p>${escapeHtml(date)}</p>
    <div class="summary">
      <div><strong>${average}</strong>ציון ממוצע</div>
      <div><strong>${audits.length}</strong>עמודים נבדקו</div>
      <div><strong>${audits.reduce((sum, audit) => sum + audit.checks.filter((check) => check.status === 'fail').length, 0)}</strong>בעיות לתיקון</div>
    </div>
  </div></div>
  <main class="wrap">
    ${audits.map(pageSection).join('')}
    <footer>נוצר עם <a href="https://github.com/aiterra-il/hebrew-seo-audit">hebrew-seo-audit</a> של <a href="https://www.aiterra.co.il">Aiterra</a></footer>
  </main>
</body>
</html>
`
}
