const mockFetch = jest.fn()

jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return (globalThis as { __EXPO_CONFIG__?: unknown }).__EXPO_CONFIG__ ===
        undefined
        ? { hostUri: '192.168.1.5:8081' }
        : (globalThis as { __EXPO_CONFIG__?: unknown }).__EXPO_CONFIG__
    },
  },
}))

jest.mock('expo-file-system', () => {
  class MockFile extends Blob {
    uri: string
    name: string

    constructor(directoryOrUri: string, name?: string) {
      const resolvedName =
        name || directoryOrUri.split('/').pop()?.split('?')[0] || ''
      super([], {
        type: resolvedName.toLowerCase().endsWith('.png')
          ? 'image/png'
          : 'image/jpeg',
      })

      this.uri = name ? `${directoryOrUri}/${name}` : directoryOrUri
      this.name = resolvedName
    }

    static downloadFileAsync = jest.fn()
  }

  return {
    File: MockFile,
    Paths: { cache: 'cache' },
  }
})

import type { ImagePickerAsset } from 'expo-image-picker'
import {
  API_BASE,
  ApiError,
  CSV_URL,
  MAX_IMAGE_BYTES,
  analyzeImage,
  assetName,
  assetUrl,
  checkPayments,
  deleteAnalysis,
  downloadCsv,
  fetchHealth,
  fetchPaymentConfig,
  fetchWallet,
  getAnalysis,
  getStats,
  listAnalyses,
  requestJson,
  validateImageAsset,
  verifyPayment,
} from '@/lib/api'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  }
}

function asset(overrides: Partial<ImagePickerAsset> = {}): ImagePickerAsset {
  return {
    uri: 'file:///photos/bird.jpg',
    fileName: 'bird.jpg',
    mimeType: 'image/jpeg',
    ...overrides,
  } as ImagePickerAsset
}

beforeEach(() => {
  mockFetch.mockReset()
})

describe('api base', () => {
  it('uses the Expo dev host when no env url is set', () => {
    expect(API_BASE).toBe('http://192.168.1.5:8000')
    expect(CSV_URL).toBe('http://192.168.1.5:8000/api/export.csv')
  })

  it('prefers EXPO_PUBLIC_API_URL and strips slashes', () => {
    const previous = process.env.EXPO_PUBLIC_API_URL
    process.env.EXPO_PUBLIC_API_URL = 'https://api.test/'

    jest.isolateModules(() => {
      const isolated = require('@/lib/api')
      expect(isolated.API_BASE).toBe('https://api.test')
    })

    if (previous === undefined) {
      delete process.env.EXPO_PUBLIC_API_URL
    } else {
      process.env.EXPO_PUBLIC_API_URL = previous
    }
  })

  it('falls back to localhost without an Expo host', () => {
    ;(globalThis as { __EXPO_CONFIG__?: unknown }).__EXPO_CONFIG__ = null

    jest.isolateModules(() => {
      const isolated = require('@/lib/api')
      expect(isolated.API_BASE).toBe('http://127.0.0.1:8000')
    })

    delete (globalThis as { __EXPO_CONFIG__?: unknown }).__EXPO_CONFIG__
  })

  it('falls back to localhost for an empty host value', () => {
    ;(globalThis as { __EXPO_CONFIG__?: unknown }).__EXPO_CONFIG__ = {
      hostUri: ':8081',
    }

    jest.isolateModules(() => {
      const isolated = require('@/lib/api')
      expect(isolated.API_BASE).toBe('http://127.0.0.1:8000')
    })

    delete (globalThis as { __EXPO_CONFIG__?: unknown }).__EXPO_CONFIG__
  })
})

describe('requestJson', () => {
  it('returns parsed json', async () => {
    mockFetch.mockResolvedValue(response({ ok: true }))

    await expect(requestJson('/test')).resolves.toEqual({ ok: true })
    expect(mockFetch).toHaveBeenCalledWith(`${API_BASE}/test`, undefined)
  })

  it('throws ApiError with string detail', async () => {
    mockFetch.mockResolvedValue(response({ detail: 'Bad input' }, 400))

    await expect(requestJson('/test')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Bad input',
      detail: 'Bad input',
    })
  })

  it('joins validation errors', async () => {
    mockFetch.mockResolvedValue(
      response({ detail: [{ msg: 'first' }, 'second'] }, 422),
    )

    await expect(requestJson('/test')).rejects.toThrow('first; second')
  })

  it('uses detail.message objects', async () => {
    mockFetch.mockResolvedValue(
      response({ detail: { message: 'Payment required' } }, 402),
    )

    await expect(requestJson('/test')).rejects.toThrow('Payment required')
  })

  it('falls back to a status message', async () => {
    mockFetch.mockResolvedValue(response({}, 500))

    await expect(requestJson('/test')).rejects.toThrow(
      'Помилка запиту (HTTP 500)',
    )
  })

  it('falls back when the body is not json', async () => {
    const broken = response(null, 502)
    broken.json.mockRejectedValue(new Error('not json'))
    mockFetch.mockResolvedValue(broken)

    await expect(requestJson('/test')).rejects.toThrow(
      'Помилка запиту (HTTP 502)',
    )
  })

  it('exposes ApiError fields', () => {
    const error = new ApiError(409, 'Conflict', { code: 1 })

    expect(error.name).toBe('ApiError')
    expect(error.status).toBe(409)
    expect(error.detail).toEqual({ code: 1 })
  })
})

describe('endpoint wrappers', () => {
  it('fetches health with an abort signal', async () => {
    mockFetch.mockResolvedValue(response({ status: 'ok' }))

    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/health`)
    expect(init.signal).toBeDefined()
  })

  it('fetches payment config, wallet and stats', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ enabled: true }))
      .mockResolvedValueOnce(response({ credits: 5 }))
      .mockResolvedValueOnce(response({ total: 1 }))

    await fetchPaymentConfig()
    await fetchWallet('0xabc')
    await getStats()

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/api/payments/config`,
      undefined,
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/api/wallet/0xabc`,
      undefined,
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      `${API_BASE}/api/stats`,
      undefined,
    )
  })

  it('posts payment verification and checks', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ status: 'credited' }))
      .mockResolvedValueOnce(response({ status: 'pending' }))

    await verifyPayment('0xabc', '0x123')
    await checkPayments('0xabc')

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/api/payments/verify`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wallet_address: '0xabc',
          transaction_hash: '0x123',
        }),
      },
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/api/payments/check/0xabc`,
      { method: 'POST' },
    )
  })

  it('lists analyses with and without a query', async () => {
    mockFetch.mockResolvedValue(response({ total: 0, items: [] }))

    await listAnalyses()
    await listAnalyses(' robin ')

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/api/analyses?limit=200`,
      undefined,
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/api/analyses?limit=200&query=robin`,
      undefined,
    )
  })

  it('gets and deletes analyses', async () => {
    mockFetch
      .mockResolvedValueOnce(response({ id: 1 }))
      .mockResolvedValueOnce(response({ deleted: 1 }))

    await getAnalysis(1)
    await deleteAnalysis(1)

    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/api/analyses/1`,
      undefined,
    )
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/api/analyses/1`,
      { method: 'DELETE' },
    )
  })
})

describe('analyzeImage', () => {
  it('uploads a named image with a wallet address', async () => {
    mockFetch.mockResolvedValue(response({ id: 1 }))
    const append = jest.spyOn(FormData.prototype, 'append')

    await analyzeImage(asset({ fileName: 'photo.png', mimeType: 'image/png' }), '0xabc')

    expect(append).toHaveBeenCalledWith('file', expect.anything(), 'photo.png')
    expect(append).toHaveBeenCalledWith('wallet_address', '0xabc')
    expect(mockFetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Accept: 'application/json' },
    })
  })

  it('adds an extension when the name has none', async () => {
    mockFetch.mockResolvedValue(response({ id: 1 }))
    const append = jest.spyOn(FormData.prototype, 'append')

    await analyzeImage(asset({ fileName: 'photo', mimeType: 'image/png' }))

    expect(append).toHaveBeenCalledWith('file', expect.anything(), 'photo.png')
    expect(append).not.toHaveBeenCalledWith(
      'wallet_address',
      expect.anything(),
    )
  })

  it('uses the file name from the uri', async () => {
    mockFetch.mockResolvedValue(response({ id: 1 }))
    const append = jest.spyOn(FormData.prototype, 'append')

    await analyzeImage(asset({ fileName: undefined, mimeType: undefined }))

    expect(append).toHaveBeenCalledWith('file', expect.anything(), 'bird.jpg')
  })

  it('falls back to a generated photo name', async () => {
    mockFetch.mockResolvedValue(response({ id: 1 }))
    const append = jest.spyOn(FormData.prototype, 'append')

    await analyzeImage(asset({ uri: 'file:///photos/', fileName: '', mimeType: 'image/png' }))

    expect(append.mock.calls[0][2]).toMatch(/^photo_\d+\.png$/)
  })
})

describe('validation and urls', () => {
  it('accepts supported extensions and mime types', () => {
    expect(validateImageAsset(asset())).toBeNull()
    expect(
      validateImageAsset(asset({ fileName: undefined, uri: 'file:///a.JPG' })),
    ).toBeNull()
    expect(
      validateImageAsset(
        asset({ fileName: undefined, uri: 'file:///a', mimeType: 'image/png' }),
      ),
    ).toBeNull()
  })

  it('rejects unsupported files and oversized images', () => {
    expect(
      validateImageAsset(
        asset({
          fileName: 'bird.gif',
          uri: 'file:///bird.gif',
          mimeType: 'image/gif',
        }),
      ),
    ).toBe('Підтримуються лише JPG, JPEG і PNG.')
    expect(
      validateImageAsset(
        asset({ fileName: undefined, uri: 'file:///a', mimeType: 'image/gif' }),
      ),
    ).toBe('Підтримуються лише JPG, JPEG і PNG.')
    expect(
      validateImageAsset(asset({ fileSize: MAX_IMAGE_BYTES + 1 })),
    ).toBe('Файл завеликий. Максимум — 10 МБ.')
  })

  it('builds asset urls', () => {
    expect(assetUrl(null)).toBeNull()
    expect(assetUrl(undefined)).toBeNull()
    expect(assetUrl('/uploads/a.jpg')).toBe(`${API_BASE}/uploads/a.jpg`)
    expect(assetUrl('https://cdn.test/a.jpg')).toBe('https://cdn.test/a.jpg')
  })

  it('names assets', () => {
    expect(assetName(asset())).toBe('bird.jpg')
    expect(
      assetName(asset({ fileName: undefined, uri: 'file:///a/b.png?x=1' })),
    ).toBe('b.png')
    expect(
      assetName(asset({ fileName: undefined, uri: 'file:///photos/' })),
    ).toBe('Фото')
  })
})

describe('downloadCsv', () => {
  it('downloads into the cache directory', async () => {
    const { File } = require('expo-file-system')
    const file = { uri: 'cache/bird_analysis.csv' }
    File.downloadFileAsync.mockResolvedValue(file)

    await expect(downloadCsv()).resolves.toBe(file)
    expect(File.downloadFileAsync).toHaveBeenCalledWith(
      CSV_URL,
      expect.objectContaining({ uri: expect.stringMatching(/bird_analysis_.*\.csv$/) }),
    )
  })
})
