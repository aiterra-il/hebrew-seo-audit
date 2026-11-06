export type Status = 'pass' | 'warn' | 'fail' | 'info'

export interface Check {
  id: string
  status: Status
  message: string
  messageEn: string
  detail: string
}

export interface ParsedPage {
  lang: string | null
  dir: string | null
  bodyDir: string | null
  title: string | null
  description: string | null
  robots: string | null
  viewport: string | null
  ogTitle: string | null
  ogImage: string | null
  ogLocale: string | null
  canonical: string | null
  hreflang: { lang: string; href: string }[]
  h1: string[]
  images: Record<string, string>[]
  jsonLd: ({ ok: true; data: unknown } | { ok: false; error: string })[]
  anchors: { href: string; text: string }[]
  mentionsStatement: boolean
  accessibilityWidget: boolean
  hebrewShare: number
  words: number
}

export interface Robots {
  groups: { agents: string[]; rules: { type: 'allow' | 'disallow'; path: string }[] }[]
  sitemaps: string[]
}

export interface CheckContext {
  url?: string
  finalUrl?: string
  status?: number
  headers?: Record<string, string>
  robots?: Robots | null
  llmsTxt?: boolean | null
}

export interface Audit {
  url: string
  finalUrl: string
  status: number
  score: number
  checks: Check[]
  page: ParsedPage | null
}

export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
  fetch?: typeof fetch
}

export declare const AI_BOTS: string[]
export declare const LIMITS: { titleMin: number; titleMax: number; descriptionMin: number; descriptionMax: number }
export declare function parsePage(html: string): ParsedPage
export declare function parseRobots(text: string): Robots
export declare function isBlocked(robots: Robots, agent: string, path?: string): boolean
export declare function checkPage(page: ParsedPage, context?: CheckContext): Check[]
export declare function scoreOf(checks: Check[]): number
export declare function auditUrl(url: string, options?: RequestOptions): Promise<Audit>
export declare function sitemapUrls(sitemapUrl: string, options?: RequestOptions & { limit?: number }): Promise<string[]>
