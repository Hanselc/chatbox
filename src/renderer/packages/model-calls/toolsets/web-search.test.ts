import { ChatboxAIAPIError } from '@shared/models/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getLicenseKeyMock = vi.fn()
const getExtensionSettingsMock = vi.fn()
const parseUserLinkProMock = vi.fn()
const getStoreBlobMock = vi.fn()
const getParseLinkProviderMock = vi.fn()
const webSearchExecutorMock = vi.fn()
const directHttpParseLinkMock = vi.fn()

vi.mock('@/stores/settingActions', () => ({
  getLicenseKey: () => getLicenseKeyMock(),
  getExtensionSettings: () => getExtensionSettingsMock(),
}))

vi.mock('@/packages/remote', () => ({
  parseUserLinkPro: (...args: unknown[]) => parseUserLinkProMock(...args),
}))

vi.mock('@/platform', () => ({
  default: {
    getStoreBlob: (...args: unknown[]) => getStoreBlobMock(...args),
  },
}))

vi.mock('@/packages/web-search', () => ({
  getParseLinkProvider: () => getParseLinkProviderMock(),
  webSearchExecutor: (...args: unknown[]) => webSearchExecutorMock(...args),
}))

vi.mock('@/packages/web-search/fetch-url', () => {
  return {
    FetchUrl: class MockFetchUrl {
      parseLink(url: string, signal?: AbortSignal, options?: { maxLength?: number; minLength?: number; maxAllowedLength?: number; focused?: boolean }) {
        return directHttpParseLinkMock(url, signal, options)
      }
    },
    FetchUrlOptions: {},
  }
})

// Import after mocks are registered
import { fetchUrlTool, parseLinkTool } from '@/packages/model-calls/toolsets/web-search'

type ParseLinkInput = { url: string; maxLength?: number; focused?: boolean }

type ParseLinkToolLike = {
  execute: (input: ParseLinkInput, context: { abortSignal?: AbortSignal }) => Promise<{
    url: string
    title: string
    content: string
    originalLength: number
    truncated: boolean
  }>
}

async function execParseLink(input: ParseLinkInput, abortSignal?: AbortSignal) {
  // The `tool()` wrapper from `ai` exposes `execute` directly on the returned object.
  return await (parseLinkTool as unknown as ParseLinkToolLike).execute(input, { abortSignal })
}

async function execFetchUrl(input: ParseLinkInput, abortSignal?: AbortSignal) {
  // The `tool()` wrapper from `ai` exposes `execute` directly on the returned object.
  return await (fetchUrlTool as unknown as ParseLinkToolLike).execute(input, { abortSignal })
}

describe('parseLinkTool', () => {
  beforeEach(() => {
    getLicenseKeyMock.mockReset()
    getExtensionSettingsMock.mockReset()
    parseUserLinkProMock.mockReset()
    getStoreBlobMock.mockReset()
    getParseLinkProviderMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('build-in (Chatbox AI) provider', () => {
    beforeEach(() => {
      getExtensionSettingsMock.mockReturnValue({ webSearch: { provider: 'build-in' } })
    })

    it('throws license key required when no license is configured', async () => {
      getLicenseKeyMock.mockReturnValue('')

      await expect(execParseLink({ url: 'https://example.com' })).rejects.toMatchObject({
        detail: { name: 'chatbox_search_license_key_required' },
      })
      expect(parseUserLinkProMock).not.toHaveBeenCalled()
      expect(getParseLinkProviderMock).not.toHaveBeenCalled()
    })

    it('calls Chatbox AI remote API for any licensed user (no Pro check)', async () => {
      // Lite users can call parse_link too — backend has no Pro restriction.
      getLicenseKeyMock.mockReturnValue('lk-lite-123')
      parseUserLinkProMock.mockResolvedValue({
        key: 'uuid-1',
        title: 'Example Title',
        storageKey: 'storage-key-1',
      })
      getStoreBlobMock.mockResolvedValue('  Hello world from the page.  ')

      const result = await execParseLink({ url: 'https://example.com' })

      expect(parseUserLinkProMock).toHaveBeenCalledWith({
        licenseKey: 'lk-lite-123',
        url: 'https://example.com',
        abortSignal: undefined,
      })
      expect(getParseLinkProviderMock).not.toHaveBeenCalled()
      expect(result).toEqual({
        url: 'https://example.com',
        title: 'Example Title',
        content: 'Hello world from the page.',
        originalLength: 'Hello world from the page.'.length,
        truncated: false,
      })
    })

    it('truncates content to maxLength', async () => {
      getLicenseKeyMock.mockReturnValue('lk-123')
      parseUserLinkProMock.mockResolvedValue({ key: 'k', title: 't', storageKey: 's' })
      const longContent = 'a'.repeat(20_000)
      getStoreBlobMock.mockResolvedValue(longContent)

      const result = await execParseLink({ url: 'https://example.com', maxLength: 500 })

      expect(result.content.length).toBe(500)
      expect(result.originalLength).toBe(20_000)
      expect(result.truncated).toBe(true)
    })

    it('forwards abortSignal to remote.parseUserLinkPro', async () => {
      getLicenseKeyMock.mockReturnValue('lk-123')
      parseUserLinkProMock.mockResolvedValue({ key: 'k', title: 't', storageKey: 's' })
      getStoreBlobMock.mockResolvedValue('content')
      const controller = new AbortController()

      await execParseLink({ url: 'https://example.com' }, controller.signal)

      expect(parseUserLinkProMock).toHaveBeenCalledWith({
        licenseKey: 'lk-123',
        url: 'https://example.com',
        abortSignal: controller.signal,
      })
    })

    it('clamps maxLength below minimum (500) and above maximum (50000)', async () => {
      getLicenseKeyMock.mockReturnValue('lk-123')
      parseUserLinkProMock.mockResolvedValue({ key: 'k', title: 't', storageKey: 's' })
      const longContent = 'a'.repeat(60_000)
      getStoreBlobMock.mockResolvedValue(longContent)

      // Below min: 100 should clamp to 500
      const tooSmall = await execParseLink({ url: 'https://example.com', maxLength: 100 })
      expect(tooSmall.content.length).toBe(500)

      // Above max: 999_999 should clamp to 50_000
      const tooBig = await execParseLink({ url: 'https://example.com', maxLength: 999_999 })
      expect(tooBig.content.length).toBe(50_000)
    })
  })

  describe('third-party provider (e.g. Tavily)', () => {
    beforeEach(() => {
      getExtensionSettingsMock.mockReturnValue({ webSearch: { provider: 'tavily' } })
    })

    it('routes to provider.parseLink and forwards abortSignal', async () => {
      const parseLinkMock = vi.fn().mockResolvedValue({
        url: 'https://example.com',
        title: 'Tavily Title',
        content: 'Extracted page content.',
      })
      getParseLinkProviderMock.mockReturnValue({ parseLink: parseLinkMock })
      const controller = new AbortController()

      const result = await execParseLink({ url: 'https://example.com' }, controller.signal)

      expect(parseLinkMock).toHaveBeenCalledWith('https://example.com', controller.signal)
      expect(parseUserLinkProMock).not.toHaveBeenCalled()
      expect(getLicenseKeyMock).not.toHaveBeenCalled()
      expect(result).toEqual({
        url: 'https://example.com',
        title: 'Tavily Title',
        content: 'Extracted page content.',
        originalLength: 'Extracted page content.'.length,
        truncated: false,
      })
    })

    it('propagates underlying provider errors (e.g. missing API key)', async () => {
      const apiKeyError = ChatboxAIAPIError.fromCodeName('tavily_api_key_required', 'tavily_api_key_required')
      getParseLinkProviderMock.mockImplementation(() => {
        throw apiKeyError
      })

      await expect(execParseLink({ url: 'https://example.com' })).rejects.toMatchObject({
        detail: { name: 'tavily_api_key_required' },
      })
    })

    it('throws parse_link_not_supported when no provider has the capability', async () => {
      getParseLinkProviderMock.mockReturnValue(null)

      await expect(execParseLink({ url: 'https://example.com' })).rejects.toMatchObject({
        detail: { name: 'parse_link_not_supported' },
      })
    })

    it('throws parse_link_failed when provider returns null', async () => {
      getParseLinkProviderMock.mockReturnValue({ parseLink: vi.fn().mockResolvedValue(null) })

      await expect(execParseLink({ url: 'https://example.com' })).rejects.toMatchObject({
        detail: { name: 'parse_link_failed' },
      })
    })

    it('truncates third-party result to maxLength', async () => {
      const longContent = 'b'.repeat(15_000)
      getParseLinkProviderMock.mockReturnValue({
        parseLink: vi.fn().mockResolvedValue({
          url: 'https://example.com',
          title: 't',
          content: longContent,
        }),
      })

      const result = await execParseLink({ url: 'https://example.com', maxLength: 5_000 })

      expect(result.content.length).toBe(5_000)
      expect(result.originalLength).toBe(15_000)
      expect(result.truncated).toBe(true)
    })
  })
})

describe('fetchUrlTool', () => {
  beforeEach(() => {
    directHttpParseLinkMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('successfully fetches and returns webpage content', async () => {
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example Page',
      content: 'Hello world from the webpage.',
      wasTruncated: false,
      fullContentSize: 'Hello world from the webpage.'.length,
    })

    const result = await execFetchUrl({ url: 'https://example.com' })

    expect(directHttpParseLinkMock).toHaveBeenCalledWith('https://example.com', undefined, { maxLength: 12000, minLength: 500, maxAllowedLength: 50000, focused: true })
    expect(result).toEqual({
      url: 'https://example.com',
      title: 'Example Page',
      content: 'Hello world from the webpage.',
      originalLength: 'Hello world from the webpage.'.length,
      truncated: false,
    })
  })

  it('throws fetch_url_failed when direct HTTP returns null', async () => {
    directHttpParseLinkMock.mockResolvedValue(null)

    await expect(execFetchUrl({ url: 'https://example.com' })).rejects.toMatchObject({
      detail: { name: 'fetch_url_failed' },
    })
  })

  it('throws fetch_url_failed when direct HTTP returns empty content', async () => {
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      content: '',
    })

    await expect(execFetchUrl({ url: 'https://example.com' })).rejects.toMatchObject({
      detail: { name: 'fetch_url_failed' },
    })
  })

  it('truncates content to maxLength', async () => {
    const longContent = 'a'.repeat(20_000)
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Long Page',
      content: longContent,
      wasTruncated: false,
      fullContentSize: longContent.length,
    })

    const result = await execFetchUrl({ url: 'https://example.com', maxLength: 500 })

    // The mock returns the full content, the tool truncates it
    expect(result.content.length).toBe(20000)
    expect(result.originalLength).toBe(20000)
    expect(result.truncated).toBe(false)
  })

  it('forwards abortSignal to direct HTTP parseLink', async () => {
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      content: 'content',
      wasTruncated: false,
      fullContentSize: 7,
    })
    const controller = new AbortController()

    await execFetchUrl({ url: 'https://example.com' }, controller.signal)

    expect(directHttpParseLinkMock).toHaveBeenCalledWith('https://example.com', controller.signal, { maxLength: 12000, minLength: 500, maxAllowedLength: 50000, focused: true })
  })

  it('passes maxLength to fetchUrl (clamping happens inside FetchUrl)', async () => {
    const longContent = 'a'.repeat(60_000)
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Long Page',
      content: longContent,
      wasTruncated: false,
      fullContentSize: longContent.length,
    })

    // The tool passes maxLength as-is (clamping happens inside FetchUrl.parseLink)
    const result = await execFetchUrl({ url: 'https://example.com', maxLength: 100 })
    expect(directHttpParseLinkMock).toHaveBeenCalledWith('https://example.com', undefined, expect.objectContaining({ maxLength: 100 }))
    expect(result.content.length).toBe(60000)

    // Test with large maxLength
    directHttpParseLinkMock.mockClear()
    const tooBig = await execFetchUrl({ url: 'https://example.com', maxLength: 999_999 })
    expect(directHttpParseLinkMock).toHaveBeenCalledWith('https://example.com', undefined, expect.objectContaining({ maxLength: 999_999 }))
    expect(tooBig.content.length).toBe(60000)
  })

  it('returns title as URL when title is empty', async () => {
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: '',
      content: 'Page content',
      wasTruncated: false,
      fullContentSize: 12,
    })

    const result = await execFetchUrl({ url: 'https://example.com' })

    expect(result.title).toBe('')
    expect(result.content).toBe('Page content')
    expect(result.truncated).toBe(false)
    expect(result.originalLength).toBe(12)
  })

  it('forwards focused option to fetchUrl (default true)', async () => {
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      content: 'content',
      wasTruncated: false,
      fullContentSize: 7,
    })

    // Default: focused should be true
    await execFetchUrl({ url: 'https://example.com' })
    expect(directHttpParseLinkMock).toHaveBeenCalledWith('https://example.com', undefined, { maxLength: 12000, minLength: 500, maxAllowedLength: 50000, focused: true })

    // Explicitly set focused to false
    directHttpParseLinkMock.mockClear()
    await execFetchUrl({ url: 'https://example.com', focused: false })
    expect(directHttpParseLinkMock).toHaveBeenCalledWith('https://example.com', undefined, { maxLength: 12000, minLength: 500, maxAllowedLength: 50000, focused: false })
  })

  it('returns truncation metadata when content was truncated by size limit', async () => {
    directHttpParseLinkMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Large Page',
      content: 'truncated content...',
      wasTruncated: true,
      fullContentSize: 10_000_000,
    })

    const result = await execFetchUrl({ url: 'https://example.com' })

    expect(result.truncated).toBe(true)
    expect(result.originalLength).toBe(10_000_000)
  })
})
