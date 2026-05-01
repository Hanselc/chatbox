import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { FetchUrl } from '@/packages/web-search/fetch-url'

// Mock platform
const mockPlatformType = vi.fn()
vi.mock('@/platform', () => ({
  default: {
    get type() {
      return mockPlatformType()
    },
  },
}))

// Mock CapacitorHttp
const mockCapacitorHttpRequest = vi.fn()
vi.mock('@capacitor/core', () => ({
  CapacitorHttp: {
    request: (...args: unknown[]) => mockCapacitorHttpRequest(...args),
  },
}))

describe('FetchUrl', () => {
  let fetchUrl: FetchUrl

  beforeEach(() => {
    fetchUrl = new FetchUrl()
    mockPlatformType.mockReturnValue('desktop')
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('parseLink', () => {
    it('should reject unsupported protocols', async () => {
      const result = await fetchUrl.parseLink('ftp://example.com/file.txt')
      expect(result).toBeNull()
    })

    it('should upgrade HTTP to HTTPS', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body>Test</body></html>'),
      })

      await fetchUrl.parseLink('http://example.com')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com/',
        expect.any(Object)
      )
    })

    it('should reject binary content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'application/pdf' },
        text: () => Promise.resolve('binary content'),
      })

      const result = await fetchUrl.parseLink('https://example.com/file.pdf')
      expect(result).toBeNull()
    })

    it('should process HTML content', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body>Hello World</body></html>'),
      })

      const result = await fetchUrl.parseLink('https://example.com')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('Hello World')
      expect(result?.url).toBe('https://example.com')
    })

    it('should process JSON content as raw text', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'application/json' },
        text: () => Promise.resolve('{"key": "value"}'),
      })

      const result = await fetchUrl.parseLink('https://example.com/data.json')

      expect(result).not.toBeNull()
      expect(result?.content).toBe('{"key": "value"}')
    })

    it('should process XML content as raw text', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'application/xml' },
        text: () => Promise.resolve('<?xml version="1.0"?><root><item>value</item></root>'),
      })

      const result = await fetchUrl.parseLink('https://example.com/data.xml')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('<root>')
    })

    it('should detect HTML-like content for unknown types', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/plain' },
        text: () => Promise.resolve('<!DOCTYPE html><html><body>Test</body></html>'),
      })

      const result = await fetchUrl.parseLink('https://example.com')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('Test')
    })

    it('should handle fetch errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const result = await fetchUrl.parseLink('https://example.com')
      expect(result).toBeNull()
    })

    it('should respect maxLength option', async () => {
      const longContent = 'a'.repeat(20_000)
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`<html><body><p>${longContent}</p></body></html>`),
      })

      const result = await fetchUrl.parseLink('https://example.com', undefined, {
        maxLength: 1000,
      })

      expect(result).not.toBeNull()
      expect(result?.content.length).toBeLessThanOrEqual(1100) // Allow for truncation message
      expect(result?.wasTruncated).toBe(true)
    })

    it('should pass abortSignal to fetch', async () => {
      const controller = new AbortController()
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body>Test</body></html>'),
      })

      await fetchUrl.parseLink('https://example.com', controller.signal)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          signal: controller.signal,
        })
      )
    })

    it('should use default options when not provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body>Test</body></html>'),
      })

      const result = await fetchUrl.parseLink('https://example.com')

      expect(result).not.toBeNull()
    })
  })

  describe('processRawText', () => {
    it('should truncate content exceeding maxLength', async () => {
      const longText = 'a'.repeat(1000)
      
      // Access private method through any type
      const result = await (fetchUrl as any).processRawText(longText, 'https://example.com', 500)
      
      expect(result.content.length).toBe(500)
      expect(result.wasTruncated).toBe(true)
      expect(result.fullContentSize).toBe(1000)
    })

    it('should not truncate content under maxLength', async () => {
      const shortText = 'Short content'
      
      const result = await (fetchUrl as any).processRawText(shortText, 'https://example.com', 500)
      
      expect(result.content).toBe(shortText)
      expect(result.wasTruncated).toBe(false)
      expect(result.fullContentSize).toBe(shortText.length)
    })

    it('should extract title from URL when not provided', async () => {
      const result = await (fetchUrl as any).processRawText('content', 'https://example.com/page-name', 1000)
      
      expect(result.title).toBe('page name')
    })
  })

  describe('extractTitleFromUrl', () => {
    it('should extract last path segment as title', () => {
      const title = (fetchUrl as any).extractTitleFromUrl('https://example.com/blog/my-article')
      expect(title).toBe('my article')
    })

    it('should decode URL-encoded characters', () => {
      const title = (fetchUrl as any).extractTitleFromUrl('https://example.com/blog/my%20article')
      expect(title).toBe('my article')
    })

    it('should remove common file extensions', () => {
      const title = (fetchUrl as any).extractTitleFromUrl('https://example.com/blog/article.html')
      expect(title).toBe('article')
    })

    it('should use hostname when no path segments', () => {
      const title = (fetchUrl as any).extractTitleFromUrl('https://example.com/')
      expect(title).toBe('example.com')
    })

    it('should handle URLs with query strings', () => {
      const title = (fetchUrl as any).extractTitleFromUrl('https://example.com/page?id=123')
      expect(title).toBe('page')
    })
  })

  describe('getContentCategory', () => {
    it('should identify HTML content', () => {
      const category = (fetchUrl as any).getContentCategory('text/html; charset=utf-8')
      expect(category).toBe('html')
    })

    it('should identify JSON content', () => {
      const category = (fetchUrl as any).getContentCategory('application/json')
      expect(category).toBe('json')
    })

    it('should identify XML content', () => {
      const category = (fetchUrl as any).getContentCategory('application/xml')
      expect(category).toBe('xml')
    })

    it('should identify text content', () => {
      const category = (fetchUrl as any).getContentCategory('text/plain')
      expect(category).toBe('text')
    })

    it('should identify binary content', () => {
      const category = (fetchUrl as any).getContentCategory('image/png')
      expect(category).toBe('binary')
    })

    it('should return unknown for null content type', () => {
      const category = (fetchUrl as any).getContentCategory(null)
      expect(category).toBe('unknown')
    })

    it('should identify PDF as binary', () => {
      const category = (fetchUrl as any).getContentCategory('application/pdf')
      expect(category).toBe('binary')
    })
  })

  describe('looksLikeHtml', () => {
    it('should detect DOCTYPE declaration', () => {
      const result = (fetchUrl as any).looksLikeHtml('<!DOCTYPE html><html>')
      expect(result).toBe(true)
    })

    it('should detect html tag', () => {
      const result = (fetchUrl as any).looksLikeHtml('<html><body>Test</body></html>')
      expect(result).toBe(true)
    })

    it('should detect head tag', () => {
      const result = (fetchUrl as any).looksLikeHtml('<head><title>Test</title></head>')
      expect(result).toBe(true)
    })

    it('should detect body tag', () => {
      const result = (fetchUrl as any).looksLikeHtml('<body>Test</body>')
      expect(result).toBe(true)
    })

    it('should return false for non-HTML content', () => {
      const result = (fetchUrl as any).looksLikeHtml('Plain text content')
      expect(result).toBe(false)
    })

    it('should handle case-insensitive detection', () => {
      const result = (fetchUrl as any).looksLikeHtml('<HTML><BODY>Test</BODY></HTML>')
      expect(result).toBe(true)
    })
  })

  describe('truncateAtBoundary', () => {
    it('should return original text if under maxLength', () => {
      const text = 'Short text'
      const result = (fetchUrl as any).truncateAtBoundary(text, 100)
      expect(result).toBe(text)
    })

    it('should truncate at paragraph boundary', () => {
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three with more text.'
      const result = (fetchUrl as any).truncateAtBoundary(text, 35)
      expect(result).toBe('Paragraph one.\n\nParagraph two.')
    })

    it('should truncate at sentence boundary', () => {
      const text = 'First sentence. Second sentence. Third sentence with more words.'
      const result = (fetchUrl as any).truncateAtBoundary(text, 35)
      expect(result).toBe('First sentence. Second sentence.')
    })

    it('should truncate at question mark with space', () => {
      const text = 'First sentence? Second sentence. Third sentence.'
      const result = (fetchUrl as any).truncateAtBoundary(text, 25)
      expect(result).toBe('First sentence? Second')
    })

    it('should truncate at word boundary', () => {
      const text = 'One two three four five six seven eight nine ten'
      const result = (fetchUrl as any).truncateAtBoundary(text, 25)
      expect(result).toBe('One two three four five')
    })

    it('should hard truncate if no good boundary found', () => {
      const text = 'Supercalifragilisticexpialidocious'
      const result = (fetchUrl as any).truncateAtBoundary(text, 10)
      expect(result).toBe('Supercalif')
    })
  })

  describe('focused mode (extractMainContent)', () => {
    it('should extract main content with focused=true', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`
          <html>
            <head><title>Test Page</title></head>
            <body>
              <nav>Navigation links</nav>
              <article>
                <h1>Main Article Title</h1>
                <p>This is the main content of the article.</p>
              </article>
              <footer>Footer content</footer>
            </body>
          </html>
        `),
      })

      const result = await fetchUrl.parseLink('https://example.com/article', undefined, {
        focused: true,
      })

      expect(result).not.toBeNull()
      expect(result?.content).toContain('Main Article Title')
      expect(result?.content).toContain('main content')
    })

    it('should include full content with focused=false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`
          <html>
            <body>
              <nav>Navigation</nav>
              <main>Main content</main>
              <footer>Footer</footer>
            </body>
          </html>
        `),
      })

      const result = await fetchUrl.parseLink('https://example.com', undefined, {
        focused: false,
      })

      expect(result).not.toBeNull()
      expect(result?.content).toContain('Navigation')
      expect(result?.content).toContain('Main content')
      expect(result?.content).toContain('Footer')
    })

    it('should fallback to full HTML when Readability fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body>Simple content</body></html>'),
      })

      const result = await fetchUrl.parseLink('https://example.com', undefined, {
        focused: true,
      })

      expect(result).not.toBeNull()
      expect(result?.content).toContain('Simple content')
    })
  })

  describe('link conversion', () => {
    it('should convert links to markdown without title attributes', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`
          <html>
            <body>
              <p>Visit <a href="https://example.com" title="Example Site">our website</a> for more.</p>
            </body>
          </html>
        `),
      })

      const result = await fetchUrl.parseLink('https://test.com')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('[our website](https://example.com)')
      expect(result?.content).not.toContain('"Example Site"')
    })

    it('should preserve relative URLs in markdown', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`
          <html>
            <body>
              <a href="/about">About Us</a>
              <a href="../contact">Contact</a>
              <a href="https://other.com/page">External</a>
            </body>
          </html>
        `),
      })

      const result = await fetchUrl.parseLink('https://example.com/blog/post')

      expect(result).not.toBeNull()
      // Relative URLs are preserved (base tag ensures they resolve correctly in browser)
      expect(result?.content).toContain('](/about)')
      expect(result?.content).toContain('](../contact)')
      // Absolute URLs are preserved as-is
      expect(result?.content).toContain('(https://other.com/page)')
    })
  })

  describe('media element handling', () => {
    it('should handle video elements', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`
          <html>
            <body>
              <video src="video.mp4" title="My Video"></video>
            </body>
          </html>
        `),
      })

      const result = await fetchUrl.parseLink('https://example.com')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('[Video:')
      expect(result?.content).toContain('My Video')
    })

    it('should handle image elements', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`
          <html>
            <body>
              <img src="image.jpg" alt="Test Image" />
            </body>
          </html>
        `),
      })

      const result = await fetchUrl.parseLink('https://example.com')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('![')
      expect(result?.content).toContain('Test Image')
    })
  })

  describe('mobile platform', () => {
    it('should use CapacitorHttp on mobile platform', async () => {
      mockPlatformType.mockReturnValue('mobile')
      mockCapacitorHttpRequest.mockResolvedValue({
        data: '<html><body>Mobile content</body></html>',
        headers: { 'content-type': 'text/html' },
      })

      await fetchUrl.parseLink('https://example.com')

      expect(mockCapacitorHttpRequest).toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('should handle JSON data from CapacitorHttp', async () => {
      mockPlatformType.mockReturnValue('mobile')
      mockCapacitorHttpRequest.mockResolvedValue({
        data: { key: 'value' },
        headers: { 'content-type': 'application/json' },
      })

      const result = await fetchUrl.parseLink('https://example.com/data.json')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('"key":"value"')
    })
  })

  describe('edge cases', () => {
    it('should handle empty HTML', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(''),
      })

      const result = await fetchUrl.parseLink('https://example.com')
      expect(result).not.toBeNull()
    })

    it('should handle HTML without body', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><head><title>Test</title></head></html>'),
      })

      const result = await fetchUrl.parseLink('https://example.com')
      expect(result).not.toBeNull()
    })

    it('should handle very long URLs', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(2000)
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body>Test</body></html>'),
      })

      const result = await fetchUrl.parseLink(longUrl)
      expect(result).not.toBeNull()
    })

    it('should handle URLs with special characters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body>Test</body></html>'),
      })

      const result = await fetchUrl.parseLink('https://example.com/path-with-üñíçødé')
      expect(result).not.toBeNull()
    })

    it('should handle malformed HTML gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve('<html><body><p>Unclosed paragraph'),
      })

      const result = await fetchUrl.parseLink('https://example.com')
      expect(result).not.toBeNull()
      expect(result?.content).toContain('Unclosed paragraph')
    })

    it('should handle script and style tag removal', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        headers: { get: () => 'text/html' },
        text: () => Promise.resolve(`
          <html>
            <head>
              <style>body { color: red; }</style>
              <script>alert('test');</script>
            </head>
            <body>
              <p>Visible content</p>
              <script>console.log('inline');</script>
            </body>
          </html>
        `),
      })

      const result = await fetchUrl.parseLink('https://example.com')

      expect(result).not.toBeNull()
      expect(result?.content).toContain('Visible content')
      expect(result?.content).not.toContain('color: red')
      expect(result?.content).not.toContain('alert')
      expect(result?.content).not.toContain('console.log')
    })
  })
})
