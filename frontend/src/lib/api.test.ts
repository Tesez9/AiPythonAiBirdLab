import {
  ACCEPTED_EXTENSIONS,
  API_BASE,
  ApiError,
  MAX_FILE_SIZE,
  analyzePhoto,
  assetUrl,
  checkPayments,
  deleteAnalysis,
  errorMessage,
  exportCsv,
  fetchAnalyses,
  fetchAnalysis,
  fetchHealth,
  fetchPaymentConfig,
  fetchStats,
  fetchWallet,
  formatDate,
  percent,
  requestJson,
  verifyPayment,
} from './api'

const fetchMock = vi.fn()

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    blob: vi.fn().mockResolvedValue(new Blob(['a,b'])),
  } as unknown as Response
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('constants and formatters', () => {
  it('exposes the configured API base and upload limits', () => {
    expect(API_BASE).toBe('http://127.0.0.1:8000')
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024)
    expect(ACCEPTED_EXTENSIONS).toEqual(['.jpg', '.jpeg', '.png'])
  })

  it('builds absolute and relative asset urls', () => {
    expect(assetUrl(null)).toBeNull()
    expect(assetUrl(undefined)).toBeNull()
    expect(assetUrl('/uploads/bird.jpg')).toBe(`${API_BASE}/uploads/bird.jpg`)
    expect(assetUrl('https://cdn.test/bird.jpg')).toBe('https://cdn.test/bird.jpg')
  })

  it('formats percentages and dates', () => {
    expect(percent(0.756)).toBe('75.6%')
    expect(percent(1)).toBe('100.0%')
    expect(formatDate('not-a-date')).toBe('not-a-date')
    expect(formatDate('2026-01-02T03:04:05')).not.toBe('')
  })

  it('maps errors to friendly messages', () => {
    expect(errorMessage(new TypeError('failed to fetch'))).toBe(
      'Не вдалося з’єднатися з сервером. Перевірте, чи він запущений.',
    )
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('unknown')).toBe('Невідома помилка')
  })
})

describe('requestJson', () => {
  it('returns parsed json for successful responses', async () => {
    fetchMock.mockResolvedValue(response({ ok: true }))

    await expect(requestJson('/test')).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/test`, undefined)
  })

  it('throws ApiError with a string detail', async () => {
    fetchMock.mockResolvedValue(response({ detail: 'Bad input' }, 400))

    await expect(requestJson('/test')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Bad input',
      detail: 'Bad input',
    })
  })

  it('joins validation detail entries', async () => {
    fetchMock.mockResolvedValue(
      response({ detail: [{ msg: 'first' }, 'second'] }, 422),
    )

    await expect(requestJson('/test')).rejects.toThrow('first; second')
  })

  it('uses the detail message object', async () => {
    fetchMock.mockResolvedValue(
      response({ detail: { message: 'Payment required' } }, 402),
    )

    await expect(requestJson('/test')).rejects.toThrow('Payment required')
  })

  it('falls back to a status message when detail is missing', async () => {
    fetchMock.mockResolvedValue(response({}, 500))

    await expect(requestJson('/test')).rejects.toThrow(
      'Помилка запиту (HTTP 500)',
    )
  })

  it('falls back when the error body is not json', async () => {
    const broken = response(null, 502)
    vi.mocked(broken.json).mockRejectedValue(new Error('not json'))
    fetchMock.mockResolvedValue(broken)

    await expect(requestJson('/test')).rejects.toThrow(
      'Помилка запиту (HTTP 502)',
    )
  })
})

describe('api functions', () => {
  it('fetches analyses with and without a search query', async () => {
    fetchMock.mockResolvedValue(response({ total: 0, items: [] }))

    await fetchAnalyses('  ')
    await fetchAnalyses(' robin ')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/api/analyses?limit=200`,
      undefined,
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/api/analyses?limit=200&query=robin`,
      undefined,
    )
  })

  it('fetches stats, health, payment config and wallet', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ total: 1 }))
      .mockResolvedValueOnce(response({ status: 'ok' }))
      .mockResolvedValueOnce(response({ enabled: true }))
      .mockResolvedValueOnce(response({ credits: 5 }))

    await expect(fetchStats()).resolves.toEqual({ total: 1 })
    await expect(fetchHealth()).resolves.toEqual({ status: 'ok' })
    await expect(fetchPaymentConfig()).resolves.toEqual({ enabled: true })
    await expect(fetchWallet('0xabc')).resolves.toEqual({ credits: 5 })

    expect(fetchMock).toHaveBeenNthCalledWith(1, `${API_BASE}/api/stats`, undefined)
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${API_BASE}/health`, undefined)
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${API_BASE}/api/payments/config`,
      undefined,
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      `${API_BASE}/api/wallet/0xabc`,
      undefined,
    )
  })

  it('posts payment verification and checks', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ status: 'credited' }))
      .mockResolvedValueOnce(response({ status: 'pending' }))

    await expect(verifyPayment('0xabc', '0x123')).resolves.toEqual({
      status: 'credited',
    })
    await expect(checkPayments('0xabc')).resolves.toEqual({ status: 'pending' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/api/payments/verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: '0xabc',
          transaction_hash: '0x123',
        }),
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/api/payments/check/0xabc`,
      { method: 'POST' },
    )
  })

  it('fetches one analysis and deletes another', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ id: 1 }))
      .mockResolvedValueOnce(response({ deleted: 1 }))

    await expect(fetchAnalysis(1)).resolves.toEqual({ id: 1 })
    await expect(deleteAnalysis(1)).resolves.toEqual({ deleted: 1 })

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/api/analyses/1`,
      undefined,
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/api/analyses/1`,
      { method: 'DELETE' },
    )
  })

  it('uploads a photo with an optional wallet address', async () => {
    fetchMock.mockResolvedValue(response({ id: 3 }))
    const file = new File(['image'], 'bird.jpg', { type: 'image/jpeg' })

    await expect(analyzePhoto(file, '0xabc')).resolves.toEqual({ id: 3 })

    const [, init] = fetchMock.mock.calls[0]
    const body = init.body as FormData

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}/api/analyses`)
    expect(init.method).toBe('POST')
    expect(body.get('file')).toBe(file)
    expect(body.get('wallet_address')).toBe('0xabc')
  })

  it('uploads without wallet when none is provided', async () => {
    fetchMock.mockResolvedValue(response({ id: 3 }))
    const file = new File(['image'], 'bird.jpg', { type: 'image/jpeg' })

    await analyzePhoto(file, null)

    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.has('wallet_address')).toBe(false)
  })

  it('exports csv and reports export errors', async () => {
    fetchMock.mockResolvedValueOnce(response(null))

    const blob = await exportCsv()
    expect(blob).toBeInstanceOf(Blob)

    fetchMock.mockResolvedValueOnce(response(null, 500))

    await expect(exportCsv()).rejects.toThrow(
      'Не вдалося експортувати CSV (HTTP 500).',
    )
  })
})

describe('ApiError', () => {
  it('stores status and detail', () => {
    const error = new ApiError(409, 'Conflict', { code: 1 })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ApiError')
    expect(error.status).toBe(409)
    expect(error.detail).toEqual({ code: 1 })
  })
})
