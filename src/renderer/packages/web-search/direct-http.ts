import { CapacitorHttp } from '@capacitor/core'
import { ofetch } from 'ofetch'
import platform from '@/platform'
import type { ParseLinkResult } from './base'
import type TurndownService from 'turndown'

// Dependencies for HTML parsing
let TurndownServiceClass: typeof TurndownService | null = null

async function getTurndownService(): Promise<typeof TurndownService> {
  if (!TurndownServiceClass) {
    const module = await import('turndown')
    TurndownServiceClass = module.default
  }
  return TurndownServiceClass
}

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.38 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0.38'

/**
 * Direct HTTP fetch for parse_link functionality.
 * Fetches webpage content directly without using external APIs.
 * Converts HTML to Markdown for better LLM consumption.
 */
export class DirectHttpParseLink {
  async parseLink(url: string, signal?: AbortSignal): Promise<ParseLinkResult | null> {
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

      // Fetch the content
      const html = await this.fetchWithRetry(url, signal)
      if (!html) {
        return null
      }

      // Parse HTML to extract title and convert to markdown
      const { title, content } = await this.parseHtml(html, url)

      return {
        url,
        title: title || url,
        content: content || '',
      }
    } catch (error) {
      console.warn('DirectHttpParseLink failed:', error)
      return null
    }
  }

  private async fetchWithRetry(url: string, signal?: AbortSignal): Promise<string | null> {
    // First attempt with standard headers
    let response = await this.fetchUrl(url, signal, false)
    
    // If blocked (Cloudflare, etc.), retry with different headers
    if (this.isBlocked(response)) {
      console.log('DirectHttpParseLink: Retrying with alternate headers...')
      response = await this.fetchUrl(url, signal, true)
    }

    if (!response || this.isBlocked(response)) {
      return null
    }

    // Check size limit
    if (response.length > MAX_RESPONSE_SIZE) {
      console.warn(`DirectHttpParseLink: Response too large (${response.length} bytes)`)
      return null
    }

    return response
  }

  private async fetchUrl(url: string, signal?: AbortSignal, useHonestUa = false): Promise<string | null> {
    const headers: Record<string, string> = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
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
      let response: string

      if (platform.type === 'mobile') {
        const result = await CapacitorHttp.request({
          url,
          method: 'GET',
          headers,
          connectTimeout: DEFAULT_TIMEOUT,
          readTimeout: DEFAULT_TIMEOUT,
        })
        response = result.data
      } else {
        response = await ofetch(url, {
          headers,
          signal,
          timeout: DEFAULT_TIMEOUT,
          retry: 0,
        })
      }

      return typeof response === 'string' ? response : JSON.stringify(response)
    } catch (error) {
      console.warn(`DirectHttpParseLink fetch error:`, error)
      return null
    }
  }

  private isBlocked(content: string | null): boolean {
    if (!content) return true
    
    const blockedIndicators = [
      'cf-browser-verification',
      'cf-im-under-attack',
      'Checking your browser',
      'Please wait while we check your browser',
      'Cloudflare',
      'Attention Required!',
      'enable JavaScript',
      'captcha',
      '403 Forbidden',
      '404 Not Found',
    ]

    const lowerContent = content.toLowerCase()
    return blockedIndicators.some(indicator => 
      lowerContent.includes(indicator.toLowerCase())
    )
  }

  private async parseHtml(html: string, url: string): Promise<{ title: string; content: string }> {
    // Create a DOM parser
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Extract title
    const title = doc.title || doc.querySelector('h1')?.textContent || url

    // Try to find the main content area
    const article = doc.querySelector('article')
    const main = doc.querySelector('main')
    const contentDiv = doc.querySelector('[class*="content"], [class*="article"], [id*="content"]')
    const body = doc.body

    const contentElement = article || main || contentDiv || body
    
    if (!contentElement) {
      return { title, content: '' }
    }

    // Remove unwanted elements
    const elementsToRemove = contentElement.querySelectorAll(
      'script, style, nav, header, footer, aside, .advertisement, .ad, .social-share, .comments, iframe, noscript'
    )
    elementsToRemove.forEach(el => el.remove())

    // Get the HTML content
    const cleanHtml = contentElement.innerHTML

    // Convert to Markdown using Turndown
    try {
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

      // Add custom rules for better extraction
      turndownService.addRule('removeEmptyLinks', {
        filter: 'a',
        replacement: (content: string, node: Node) => {
          const href = (node as HTMLAnchorElement).getAttribute('href')
          if (!href || content.trim() === '') {
            return content
          }
          // Resolve relative URLs
          try {
            const absoluteUrl = new URL(href, url).toString()
            return `[${content}](${absoluteUrl})`
          } catch {
            return `[${content}](${href})`
          }
        },
      })

      turndownService.addRule('preserveImages', {
        filter: 'img',
        replacement: (content: string, node: Node) => {
          const src = (node as HTMLImageElement).getAttribute('src')
          const alt = (node as HTMLImageElement).getAttribute('alt') || ''
          if (!src) return ''
          
          try {
            const absoluteUrl = new URL(src, url).toString()
            return `![${alt}](${absoluteUrl})`
          } catch {
            return `![${alt}](${src})`
          }
        },
      })

      const markdown = turndownService.turndown(cleanHtml)
      
      // Clean up the markdown
      const cleanedMarkdown = this.cleanMarkdown(markdown)

      return { title: title.trim(), content: cleanedMarkdown }
    } catch (error) {
      console.warn('Turndown conversion failed, falling back to text extraction:', error)
      // Fallback: return plain text
      const text = contentElement.textContent || ''
      return { title: title.trim(), content: text.trim() }
    }
  }

  private cleanMarkdown(markdown: string): string {
    return markdown
      .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\[\s*\]/g, '') // Remove empty links
      .replace(/!\[\]\([^)]+\)/g, '') // Remove empty images
      .trim()
  }
}

export default DirectHttpParseLink
