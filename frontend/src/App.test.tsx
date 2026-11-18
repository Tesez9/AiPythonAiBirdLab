import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import * as api from './lib/api'
import type { Analysis, PaymentConfig, Stats, WalletInfo } from './lib/api'

vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>()

  return {
    ...actual,
    analyzePhoto: vi.fn(),
    checkPayments: vi.fn(),
    deleteAnalysis: vi.fn(),
    exportCsv: vi.fn(),
    fetchAnalyses: vi.fn(),
    fetchAnalysis: vi.fn(),
    fetchHealth: vi.fn(),
    fetchPaymentConfig: vi.fn(),
    fetchStats: vi.fn(),
    fetchWallet: vi.fn(),
    verifyPayment: vi.fn(),
  }
})

const ADDRESS = '0xabcdef0000000000000000000000000000000001'
const TX_HASH = '0x' + 'ab'.repeat(32)

const analysis: Analysis = {
  id: 1,
  image_name: 'robin.jpg',
  image_url: '/uploads/robin.jpg',
  predicted_species: 'Robin',
  confidence: 0.91,
  low_confidence: false,
  analysis_date: '2026-01-02T03:04:05',
  description: 'A small bird',
  source: 'https://example.com/robin',
  top3: [{ species: 'Robin', confidence: 0.91 }],
  info: null,
}

const stats: Stats = {
  total: 1,
  unique_species: 1,
  average_confidence: 0.91,
  highest: analysis,
  lowest: analysis,
  top_species: [{ species: 'Robin', count: 1 }],
}

const wallet: WalletInfo = {
  wallet_address: ADDRESS,
  credits: 5,
  price_wei: '2000000000000000',
  package_credits: 5,
  last_transaction_hash: null,
}

const disabledConfig: PaymentConfig = {
  enabled: false,
  chain_id: 31337,
  chain_name: 'Anvil',
  receiver: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  price_wei: '2000000000000000',
  price_eth: '0.002',
  credits: 5,
  confirmations: 1,
  explorer_url: '',
  public_rpc_url: 'http://127.0.0.1:8545',
}

const enabledConfig: PaymentConfig = { ...disabledConfig, enabled: true }

function mockApiDefaults() {
  vi.mocked(api.fetchAnalyses).mockResolvedValue({ total: 1, items: [analysis] })
  vi.mocked(api.fetchStats).mockResolvedValue(stats)
  vi.mocked(api.fetchHealth).mockResolvedValue({
    status: 'ok',
    database: 'ok',
    ai_server: 'ok',
    ai_url: 'http://ai.test',
  })
  vi.mocked(api.fetchPaymentConfig).mockResolvedValue(disabledConfig)
  vi.mocked(api.fetchWallet).mockResolvedValue(wallet)
  vi.mocked(api.analyzePhoto).mockResolvedValue({ ...analysis, credits_left: 4 })
  vi.mocked(api.fetchAnalysis).mockResolvedValue(analysis)
  vi.mocked(api.deleteAnalysis).mockResolvedValue({ deleted: 1 })
  vi.mocked(api.exportCsv).mockResolvedValue(new Blob(['a,b']))
  vi.mocked(api.verifyPayment).mockResolvedValue({
    status: 'credited',
    credits: 5,
    transaction_hash: TX_HASH,
  })
  vi.mocked(api.checkPayments).mockResolvedValue({
    status: 'credited',
    credits: 5,
    transaction_hash: TX_HASH,
  })
}

function renderApp() {
  return render(<App />)
}

async function waitForInitialLoad() {
  await screen.findByText(/Знайдено: 1/)
}

beforeEach(() => {
  mockApiDefaults()
  window.localStorage.clear()
  delete window.ethereum
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('App initial load', () => {
  it('loads health, history and stats', async () => {
    renderApp()

    await waitForInitialLoad()

    expect(screen.getByText('Сервер працює')).toBeInTheDocument()
    expect(screen.getAllByText('Robin').length).toBeGreaterThan(0)
    expect(screen.getByText('Всього аналізів: 1')).toBeInTheDocument()
    expect(screen.queryByText('Оплата аналізів')).not.toBeInTheDocument()
  })

  it('shows the degraded health state', async () => {
    vi.mocked(api.fetchHealth).mockResolvedValue({
      status: 'degraded',
      database: 'ok',
      ai_server: 'down',
      ai_url: 'http://ai.test',
    })

    renderApp()

    expect(await screen.findByText('AI недоступний')).toBeInTheDocument()
  })

  it('shows a connection error and closes it', async () => {
    vi.mocked(api.fetchAnalyses).mockRejectedValue(new TypeError('offline'))

    renderApp()

    expect(
      await screen.findByText(
        'Не вдалося з’єднатися з сервером. Перевірте, чи він запущений.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }))

    await waitFor(() => {
      expect(
        screen.queryByText(
          'Не вдалося з’єднатися з сервером. Перевірте, чи він запущений.',
        ),
      ).not.toBeInTheDocument()
    })
  })

  it('handles a missing payment config', async () => {
    vi.mocked(api.fetchPaymentConfig).mockRejectedValue(new Error('no config'))

    renderApp()
    await waitForInitialLoad()

    expect(screen.queryByText('Оплата аналізів')).not.toBeInTheDocument()
  })
})

describe('photo validation and analysis', () => {
  it('rejects unsupported extensions and large files', async () => {
    const { container } = renderApp()
    await waitForInitialLoad()
    const input = container.querySelector('input[type="file"]')!

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'bird.gif', { type: 'image/gif' })] },
    })
    expect(
      await screen.findByText('Підтримуються лише JPG, JPEG і PNG.'),
    ).toBeInTheDocument()

    const bigFile = new File(['x'], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigFile, 'size', { value: api.MAX_FILE_SIZE + 1 })
    fireEvent.change(input, { target: { files: [bigFile] } })

    expect(
      await screen.findByText('Файл завеликий. Максимум — 10 МБ.'),
    ).toBeInTheDocument()
  })

  it('analyzes a selected photo and refreshes history', async () => {
    const { container } = renderApp()
    await waitForInitialLoad()
    const file = new File(['image'], 'robin.jpg', { type: 'image/jpeg' })

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    })

    expect(screen.getByText('Вибрано: robin.jpg')).toBeInTheDocument()
    expect(screen.getByAltText('Фото')).toHaveAttribute('src', 'blob:preview')

    fireEvent.click(screen.getByRole('button', { name: 'Аналізувати' }))

    expect(await screen.findByText('Розпізнано: Robin.')).toBeInTheDocument()
    expect(api.analyzePhoto).toHaveBeenCalledWith(file, null)
    expect(
      screen.getByRole('heading', { name: 'Robin' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Вибрано: robin.jpg')).not.toBeInTheDocument()
    expect(api.fetchAnalyses).toHaveBeenCalledTimes(2)
  })

  it('requires a connected wallet when payments are enabled', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    const { container } = renderApp()
    await waitForInitialLoad()

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'robin.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Аналізувати' }))

    expect(
      await screen.findByText('Підключіть MetaMask, щоб оплатити аналіз.'),
    ).toBeInTheDocument()
    expect(api.analyzePhoto).not.toHaveBeenCalled()
  })

  it('shows a payment required error when credits run out', async () => {
    vi.mocked(api.analyzePhoto).mockRejectedValue(
      new api.ApiError(402, 'Payment required'),
    )
    const { container } = renderApp()
    await waitForInitialLoad()

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'robin.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Аналізувати' }))

    expect(
      await screen.findByText(
        'Оплачені аналізи закінчилися. Придбайте новий пакет через MetaMask.',
      ),
    ).toBeInTheDocument()
  })

  it('shows generic analysis errors', async () => {
    vi.mocked(api.analyzePhoto).mockRejectedValue(new Error('AI down'))
    const { container } = renderApp()
    await waitForInitialLoad()

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(['x'], 'robin.jpg', { type: 'image/jpeg' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Аналізувати' }))

    expect(await screen.findByText('AI down')).toBeInTheDocument()
  })
})

describe('history actions', () => {
  it('searches and clears the query', async () => {
    renderApp()
    await waitForInitialLoad()
    const search = screen.getByPlaceholderText('Вид або назва файлу')

    fireEvent.change(search, { target: { value: 'sparrow' } })
    fireEvent.click(screen.getByRole('button', { name: 'Знайти' }))

    await waitFor(() => {
      expect(api.fetchAnalyses).toHaveBeenLastCalledWith('sparrow')
    })
    expect(await screen.findByText(/запит: sparrow/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Скинути' }))

    await waitFor(() => {
      expect(api.fetchAnalyses).toHaveBeenLastCalledWith('')
    })
  })

  it('loads analysis details', async () => {
    renderApp()
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Деталі' }))

    expect(api.fetchAnalysis).toHaveBeenCalledWith(1)
    expect(
      await screen.findByRole('heading', { name: 'Robin' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('A small bird')).toBeInTheDocument()
  })

  it('does not delete when confirmation is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    renderApp()
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }))

    expect(api.deleteAnalysis).not.toHaveBeenCalled()
  })

  it('deletes a record and refreshes the list', async () => {
    renderApp()
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }))

    expect(await screen.findByText('Запис видалено.')).toBeInTheDocument()
    expect(api.deleteAnalysis).toHaveBeenCalledWith(1)
    expect(api.fetchAnalyses).toHaveBeenCalledTimes(2)
  })

  it('exports csv', async () => {
    renderApp()
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Експорт CSV' }))

    expect(await screen.findByText('Експортовано 1 записів.')).toBeInTheDocument()
    expect(api.exportCsv).toHaveBeenCalledOnce()
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })

  it('shows export errors', async () => {
    vi.mocked(api.exportCsv).mockRejectedValue(new Error('export failed'))
    renderApp()
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Експорт CSV' }))

    expect(await screen.findByText('export failed')).toBeInTheDocument()
  })
})

describe('wallet flows', () => {
  it('connects MetaMask and stores the address', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    const request = vi.fn().mockResolvedValue([ADDRESS])
    window.ethereum = { request }
    renderApp()
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Підключити MetaMask' }))

    expect(await screen.findByText('MetaMask підключено.')).toBeInTheDocument()
    expect(api.fetchWallet).toHaveBeenCalledWith(ADDRESS)
    expect(window.localStorage.getItem('aibirdlab.wallet')).toBe(ADDRESS)
    expect(screen.getByText('0xabcd…0001')).toBeInTheDocument()
  })

  it('reports a missing MetaMask provider', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    renderApp()
    await waitForInitialLoad()

    fireEvent.click(screen.getByRole('button', { name: 'Підключити MetaMask' }))

    expect(
      await screen.findByText(
        'MetaMask не знайдено. Встановіть розширення MetaMask у браузері.',
      ),
    ).toBeInTheDocument()
  })

  it('pays for credits and refreshes the wallet', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    window.localStorage.setItem('aibirdlab.wallet', ADDRESS)
    const request = vi.fn().mockImplementation(({ method }) => {
      if (method === 'eth_chainId') {
        return Promise.resolve('0x7a69')
      }

      if (method === 'eth_sendTransaction') {
        return Promise.resolve(TX_HASH)
      }

      return Promise.resolve(null)
    })
    window.ethereum = { request }
    renderApp()
    await waitForInitialLoad()
    await screen.findByText('0xabcd…0001')

    fireEvent.click(screen.getByRole('button', { name: 'Купити 5 аналізів' }))

    expect(
      await screen.findByText('Оплату зараховано: 5 аналізів.'),
    ).toBeInTheDocument()
    expect(api.verifyPayment).toHaveBeenCalledWith(ADDRESS, TX_HASH)
    expect(request).toHaveBeenCalledWith({
      method: 'eth_sendTransaction',
      params: [
        {
          from: ADDRESS,
          to: enabledConfig.receiver,
          value: '0x71afd498d0000',
        },
      ],
    })
  })

  it('checks a payment by transaction hash', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    window.localStorage.setItem('aibirdlab.wallet', ADDRESS)
    renderApp()
    await waitForInitialLoad()
    await screen.findByText('0xabcd…0001')

    fireEvent.change(screen.getByPlaceholderText('Хеш транзакції 0x...'), {
      target: { value: TX_HASH },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(
      await screen.findByText('Оплату зараховано: 5 аналізів.'),
    ).toBeInTheDocument()
    expect(api.verifyPayment).toHaveBeenCalledWith(ADDRESS, TX_HASH)
  })

  it('checks all payments when the hash is empty', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    window.localStorage.setItem('aibirdlab.wallet', ADDRESS)
    renderApp()
    await waitForInitialLoad()
    await screen.findByText('0xabcd…0001')

    fireEvent.click(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(
      await screen.findByText('Оплату зараховано: 5 аналізів.'),
    ).toBeInTheDocument()
    expect(api.checkPayments).toHaveBeenCalledWith(ADDRESS)
  })

  it('shows a pending payment notice', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    vi.mocked(api.checkPayments).mockResolvedValue({
      status: 'pending',
      transaction_hash: TX_HASH,
      confirmations: 0,
      required: 1,
    })
    window.localStorage.setItem('aibirdlab.wallet', ADDRESS)
    renderApp()
    await waitForInitialLoad()
    await screen.findByText('0xabcd…0001')

    fireEvent.click(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(
      await screen.findByText('Транзакція ще не підтверджена: 0/1.'),
    ).toBeInTheDocument()
  })

  it('explains when no new payment is found', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    vi.mocked(api.checkPayments).mockRejectedValue(
      new api.ApiError(404, 'New payment not found'),
    )
    window.localStorage.setItem('aibirdlab.wallet', ADDRESS)
    renderApp()
    await waitForInitialLoad()
    await screen.findByText('0xabcd…0001')

    fireEvent.click(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(
      await screen.findByText(
        'Нову оплату не знайдено. Переконайтеся, що транзакція підтверджена.',
      ),
    ).toBeInTheDocument()
  })

  it('reacts to MetaMask account changes', async () => {
    vi.mocked(api.fetchPaymentConfig).mockResolvedValue(enabledConfig)
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const ethereum = {
      request: vi.fn(),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler
      }),
      removeListener: vi.fn(),
    }
    window.ethereum = ethereum
    renderApp()
    await waitForInitialLoad()
    await waitFor(() => {
      expect(ethereum.on).toHaveBeenCalledWith(
        'accountsChanged',
        expect.any(Function),
      )
    })

    await act(async () => {
      handlers.accountsChanged([ADDRESS])
    })

    await waitFor(() => {
      expect(window.localStorage.getItem('aibirdlab.wallet')).toBe(ADDRESS)
    })
    expect(api.fetchWallet).toHaveBeenCalledWith(ADDRESS)

    await act(async () => {
      handlers.accountsChanged([])
    })

    expect(window.localStorage.getItem('aibirdlab.wallet')).toBeNull()
  })
})
