import { CapacitorHttp } from '@capacitor/core'
import platform from '@/platform'
import type { ParseLinkResult } from './base'
import type TurndownService from 'turndown'
import type { Readability as ReadabilityType } from '@mozilla/readability'

// Dependencies for HTML parsing
let TurndownServiceClass: typeof TurndownService | null = null
let ReadabilityClass: typeof ReadabilityType | null = null

async function getTurndownService(): Promise<typeof TurndownService> {
  if (!TurndownServiceClass) {
    const module = await import('turndown')
    TurndownServiceClass = module.default
  }
  return TurndownServiceClass
}

async function getReadability(): Promise<typeof ReadabilityType> {
  if (!ReadabilityClass) {
    const module = await import('@mozilla/readability')
    ReadabilityClass = module.Readability
  }
  return ReadabilityClass
}

const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.38 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0.38'

// Size limits by content type (in bytes)
const SIZE_LIMITS = {
  html: 5 * 1024 * 1024,      // 5MB
  json: 10 * 1024 * 1024,     // 10MB
  xml: 5 * 1024 * 1024,       // 5MB
  text: 5 * 1024 * 1024,      // 5MB
  binary: 0,                   // Reject binary
  unknown: 1 * 1024 * 1024,   // 1MB for unknown
}

type ContentCategory = 'html' | 'json' | 'xml' | 'text' | 'binary' | 'unknown'

interface FetchResponse {
  content: string
  contentType: string | null
}

export interface FetchUrlOptions {
  maxLength?: number
  minLength?: number
  maxAllowedLength?: number
  focused?: boolean
}

/**
 * Direct HTTP fetch for parse_link functionality.
 * Fetches webpage content directly without using external APIs.
 * Handles different content types appropriately:
 * - HTML: Converts to Markdown
 * - JSON/XML/Text: Returns raw content
 * - Binary: Rejected
 */
export class FetchUrl {
  async parseLink(url: string, signal?: AbortSignal, options?: FetchUrlOptions): Promise<ParseLinkResult | null> {
    const maxLength = options?.maxLength ?? 12000
    const minLength = options?.minLength ?? 500
    const maxAllowedLength = options?.maxAllowedLength ?? 50000
    const focused = options?.focused ?? true
    const normalizedMaxLength = Math.min(Math.max(maxLength, minLength), maxAllowedLength)
    try {
      // Validate URL
      const urlObj = new URL(url)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        console.warn(`DirectHttpParseLink: Unsupported protocol ${urlObj.protocol}`)
        return null
      }

      // Upgrade HTTP to HTTPS
      if (urlObj.protocol === 'http:') {
        urlObj.protocol = 'https:'
        url = urlObj.toString()
      }

      // Fetch the content with headers
      const response = await this.internalFetch(url, signal)
      if (!response) {
        return null
      }

      // Detect content type
      const category = this.getContentCategory(response.contentType)

      // Reject binary content
      if (category === 'binary') {
        console.warn(`DirectHttpParseLink: Binary content not supported (${response.contentType})`)
        return null
      }

      // Process based on content type
      switch (category) {
        case 'html':
          return this.processHtml(response.content, url, normalizedMaxLength, focused)
        case 'json':
        case 'xml':
        case 'text':
          return this.processRawText(response.content, url, normalizedMaxLength)
        default:
          // Unknown type - check if it looks like HTML
          if (this.looksLikeHtml(response.content)) {
            return this.processHtml(response.content, url, normalizedMaxLength, focused)
          }
          return this.processRawText(response.content, url, normalizedMaxLength)
      }
    } catch (error) {
      console.warn('DirectHttpParseLink failed:', error)
      return null
    }
  }

  private getContentCategory(contentType: string | null): ContentCategory {
    if (!contentType) return 'unknown'
    const ct = contentType.toLowerCase()

    if (ct.includes('text/html')) return 'html'
    if (ct.includes('application/json') || ct.includes('text/json')) return 'json'
    if (ct.includes('application/xml') || ct.includes('text/xml')) return 'xml'
    if (ct.startsWith('text/')) return 'text'
    if (ct.startsWith('image/') || ct.includes('pdf') || ct.includes('octet-stream')) return 'binary'

    return 'unknown'
  }

  private looksLikeHtml(content: string): boolean {
    const trimmed = content.trim()
    // Check first 500 chars for HTML indicators (case-insensitive)
    const start = trimmed.slice(0, 500)
    const startLower = start.toLowerCase()
    if (startLower.includes('<!doctype html') ||
      startLower.includes('<html') ||
      startLower.includes('<head') ||
      startLower.includes('<body')) {
      return true
    }
    return false
  }

  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      // Get last meaningful segment
      const segments = pathname.split('/').filter(s => s.length > 0)
      if (segments.length === 0) return urlObj.hostname

      const lastSegment = segments[segments.length - 1]
      // Decode URL encoding and clean up
      const decoded = decodeURIComponent(lastSegment)
      // Remove common extensions
      const withoutExt = decoded.replace(/\.(json|xml|txt|md|html?)$/i, '')
      // Replace separators with spaces and clean up
      const cleaned = withoutExt.replace(/[-_]/g, ' ').trim()
      return cleaned || urlObj.hostname
    } catch {
      return url
    }
  }

  private async processHtml(html: string, url: string, maxLength: number, focused: boolean): Promise<ParseLinkResult> {
    const result = await this.parseHtml(html, url, maxLength, focused)
    return {
      url,
      title: this.extractTitleFromUrl(url),
      content: result.content || '',
      fullContentSize: result.fullContentSize,
      wasTruncated: result.wasTruncated,
    }
  }

  private processRawText(content: string, url: string, maxLength: number): ParseLinkResult {
    let processedContent = content
    let wasTruncated = false

    if (maxLength > 0 && content.length > maxLength) {
      processedContent = content.slice(0, maxLength)
      wasTruncated = true
    }

    return {
      url,
      title: this.extractTitleFromUrl(url),
      content: processedContent,
      fullContentSize: content.length,
      wasTruncated: wasTruncated,
    }
  }

  private async internalFetch(url: string, signal?: AbortSignal): Promise<FetchResponse | null> {
    let response = await this.fetchUrl(url, signal, false)
    return response
  }

  private async fetchUrl(url: string, signal?: AbortSignal, useHonestUa = false): Promise<FetchResponse | null> {
    const headers: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'DNT': '1',
      'Connection': 'keep-alive',
    }

    if (useHonestUa) {
      // More honest user agent for sites that block bots
      headers['User-Agent'] = 'ChatboxAI/1.0 (Personal Research Assistant)'
    } else {
      headers['User-Agent'] = USER_AGENT
    }

    try {
      if (platform.type === 'mobile') {
        const result = await CapacitorHttp.request({
          url,
          method: 'GET',
          headers,
          connectTimeout: DEFAULT_TIMEOUT,
          readTimeout: DEFAULT_TIMEOUT,
        })

        // CapacitorHttp returns { data, status, headers, url }
        const contentType = result.headers?.['content-type'] || result.headers?.['Content-Type'] || null
        const content = typeof result.data === 'string' ? result.data : JSON.stringify(result.data)

        return { content, contentType }
      } else {
        // Desktop: Use native fetch API to access headers
        const fetchResponse = await fetch(url, {
          headers,
          signal,
        })

        const contentType = fetchResponse.headers.get('content-type')
        const content = await fetchResponse.text()

        return { content, contentType }
      }
    } catch (error) {
      console.warn(`DirectHttpParseLink fetch error:`, error)
      return null
    }
  }

  private async parseHtml(html: string, url: string, maxLength: number, focused: boolean): Promise<{ content: string; fullContentSize: number; wasTruncated: boolean }> {
    // If focused mode is enabled, extract main content using Readability
    const htmlToProcess = focused ? await this.extractMainContent(html, url) : html

    // Convert to Markdown using Turndown
    const TurndownService = await getTurndownService()
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
      linkReferenceStyle: 'full',
    })

    // Remove unwanted elements
    turndownService.remove(['head', 'script', 'style', 'noscript'])

    // Override link handling to strip title attributes (cleaner markdown)
    turndownService.addRule('links', {
      filter: 'a',
      replacement: (content: string, node: Node) => {
        const href = (node as HTMLAnchorElement).getAttribute('href') || ''
        return href ? `[${content}](${href})` : content
      },
    })

    turndownService.addRule('canvas', {
      filter: 'canvas',
      replacement: (_content: string, node: Node) => {
        const title = (node as HTMLCanvasElement).getAttribute('title') || ''
        return `\n[Canvas element: { title: '${title}' }]\n`
      },
    })

    turndownService.addRule('video', {
      filter: 'video',
      replacement: (_content: string, node: Node) => {
        const src = (node as HTMLVideoElement).getAttribute('src') || '(no source)'
        const title = (node as HTMLVideoElement).getAttribute('title') || ''
        return `\n[Video: { title: '${title}', src: '${src}' }]\n`
      },
    })

    turndownService.addRule('audio', {
      filter: 'audio',
      replacement: (_content: string, node: Node) => {
        const src = (node as HTMLAudioElement).getAttribute('src') || '(no source)'
        const title = (node as HTMLAudioElement).getAttribute('title') || ''
        return `\n[Audio: { title: '${title}', src: '${src}' }]\n`
      },
    })

    turndownService.addRule('embed', {
      filter: 'embed',
      replacement: (_content: string, node: Node) => {
        const src = (node as HTMLEmbedElement).getAttribute('src') || '(no source)'
        const title = (node as HTMLEmbedElement).getAttribute('title') || ''
        const type = (node as HTMLEmbedElement).getAttribute('type') || ''
        return `\n[Embedded content: { title: '${title}', src: '${src}', type: '${type}' }]\n`
      },
    })

    turndownService.addRule('object', {
      filter: 'object',
      replacement: (_content: string, node: Node) => {
        const data = (node as HTMLObjectElement).getAttribute('data') || '(no source)'
        const title = (node as HTMLObjectElement).getAttribute('title') || ''
        const type = (node as HTMLObjectElement).getAttribute('type') || ''
        return `\n[Object: { title: '${title}', data: '${data}', type: '${type}' }]\n`
      },
    })

    turndownService.addRule('iframe', {
      filter: 'iframe',
      replacement: (_content: string, node: Node) => {
        const src = (node as HTMLIFrameElement).getAttribute('src') || '(no source)'
        const title = (node as HTMLIFrameElement).getAttribute('title') || ''
        return `\n[External iframe: { title: '${title}', src: '${src}' }]\n`
      },
    })

    turndownService.addRule('svg', {
      filter: 'svg',
      replacement: (_content: string, node: Node) => {
        const title = (node as SVGSVGElement).querySelector('title')?.textContent || ''
        return `\n[SVG image: { title: '${title}' }]\n`
      },
    })

    // Convert HTML to markdown
    let markdown = turndownService.turndown(htmlToProcess)
    const fullContentSize = markdown.length
    let wasTruncated = false

    // Truncate markdown if needed (after conversion)
    if (maxLength > 0 && markdown.length > maxLength) {
      markdown = this.truncateAtBoundary(markdown, maxLength)
      markdown += '\n\n[Content truncated. To retrieve more content, call fetch_url with a higher maxLength]'
      wasTruncated = true
    }

    return { content: markdown, fullContentSize, wasTruncated }
  }

  private async extractMainContent(html: string, url: string): Promise<string> {
    try {
      const Readability = await getReadability()
      const parser = new DOMParser()

      // Inject a <base> tag to ensure relative URLs are resolved correctly
      // This prevents URLs from being resolved against localhost
      let htmlWithBase = html
      if (url) {
        const baseTag = `<base href="${url}">`
        if (html.includes('<head>')) {
          htmlWithBase = html.replace(/<head>/i, `<head>${baseTag}`)
        } else if (html.includes('<html>')) {
          htmlWithBase = html.replace(/<html>/i, `<html><head>${baseTag}</head>`)
        } else {
          htmlWithBase = baseTag + html
        }
      }

      const doc = parser.parseFromString(htmlWithBase, 'text/html')
      const reader = new Readability(doc)
      const article = reader.parse()

      if (article && article.content) {
        return article.content
      }
      return html
    } catch (error) {
      console.warn('Readability extraction failed, falling back to full HTML:', error)
      return html
    }
  }

  private truncateAtBoundary(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text

    // Try to truncate at paragraph boundary
    const lastParagraph = text.lastIndexOf('\n\n', maxLength)
    if (lastParagraph > maxLength * 0.8) {
      return text.slice(0, lastParagraph)
    }

    // Try to truncate at sentence boundary
    const lastSentence = Math.max(
      text.lastIndexOf('. ', maxLength),
      text.lastIndexOf('? ', maxLength),
      text.lastIndexOf('! ', maxLength)
    )
    if (lastSentence > maxLength * 0.8) {
      return text.slice(0, lastSentence + 1)
    }

    // Try to truncate at word boundary
    const lastSpace = text.lastIndexOf(' ', maxLength)
    if (lastSpace > maxLength * 0.8) {
      return text.slice(0, lastSpace)
    }

    // Fallback: hard truncate
    return text.slice(0, maxLength)
  }
}

export default FetchUrl
