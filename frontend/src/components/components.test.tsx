import { fireEvent, render, screen } from '@testing-library/react'
import AnalysisResult from './AnalysisResult'
import Header from './Header'
import HistoryList from './HistoryList'
import Message from './Message'
import StatsPanel from './StatsPanel'
import UploadCard from './UploadCard'
import WalletCard from './WalletCard'
import type { Analysis, PaymentConfig, Stats, WalletInfo } from '../lib/api'

const analysis: Analysis = {
  id: 1,
  image_name: 'robin.jpg',
  image_url: '/uploads/robin.jpg',
  predicted_species: 'Robin',
  confidence: 0.9123,
  low_confidence: false,
  analysis_date: '2026-01-02T03:04:05',
  description: 'A small bird',
  source: 'https://example.com/robin',
  top3: [
    { species: 'Robin', confidence: 0.9123 },
    { species: 'Sparrow', confidence: 0.03 },
  ],
  info: {
    species: 'Robin',
    ukrainian: 'Вільшанка',
    scientific: 'Erithacus rubecula',
    family: 'Muscicapidae',
    habitat: 'Ліси',
    range: 'Європа',
    diet: 'Комахи',
    size: '12 см',
    status: 'LC',
    facts: 'Співає',
    description: 'Опис',
    source: 'https://example.com',
  },
}

const paymentConfig: PaymentConfig = {
  enabled: true,
  chain_id: 31337,
  chain_name: 'Anvil',
  receiver: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  price_wei: '2000000000000000',
  price_eth: '0.002',
  credits: 5,
  confirmations: 1,
  explorer_url: 'https://explorer.test',
  public_rpc_url: 'http://127.0.0.1:8545',
}

const wallet: WalletInfo = {
  wallet_address: '0xabcdef0000000000000000000000000000000001',
  credits: 5,
  price_wei: '2000000000000000',
  package_credits: 5,
  last_transaction_hash: '0x' + 'ab'.repeat(32),
}

const stats: Stats = {
  total: 3,
  unique_species: 2,
  average_confidence: 0.75,
  highest: { ...analysis, confidence: 0.95 },
  lowest: { ...analysis, predicted_species: 'Sparrow', confidence: 0.4 },
  top_species: [
    { species: 'Robin', count: 2 },
    { species: 'Sparrow', count: 1 },
  ],
}

describe('Header', () => {
  it('shows offline, online and degraded states', () => {
    const { rerender } = render(<Header health={null} />)

    expect(screen.getByText('Сервер не підключено')).toBeInTheDocument()

    rerender(
      <Header
        health={{ status: 'ok', database: 'ok', ai_server: 'ok', ai_url: 'x' }}
      />,
    )
    expect(screen.getByText('Сервер працює')).toBeInTheDocument()

    rerender(
      <Header
        health={{
          status: 'degraded',
          database: 'ok',
          ai_server: 'down',
          ai_url: 'x',
        }}
      />,
    )
    expect(screen.getByText('AI недоступний')).toBeInTheDocument()
  })
})

describe('Message', () => {
  it('renders the text and calls onClose', () => {
    const onClose = vi.fn()

    render(<Message tone='error' text='Something failed' onClose={onClose} />)

    expect(screen.getByText('Something failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('UploadCard', () => {
  it('disables analysis until a file is chosen', () => {
    const onAnalyze = vi.fn()
    const onFileChange = vi.fn()

    render(
      <UploadCard
        file={null}
        preview={null}
        isAnalyzing={false}
        inputRef={{ current: null }}
        onFileChange={onFileChange}
        onAnalyze={onAnalyze}
      />,
    )

    expect(screen.getByRole('button', { name: 'Аналізувати' })).toBeDisabled()
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [] },
    })
    expect(onFileChange).toHaveBeenCalled()
  })

  it('shows the selected file, preview and loading state', () => {
    const onAnalyze = vi.fn()
    const file = new File(['x'], 'robin.jpg', { type: 'image/jpeg' })

    render(
      <UploadCard
        file={file}
        preview='blob:preview'
        isAnalyzing
        inputRef={{ current: null }}
        onFileChange={vi.fn()}
        onAnalyze={onAnalyze}
      />,
    )

    expect(screen.getByText('Вибрано: robin.jpg')).toBeInTheDocument()
    expect(screen.getByAltText('Фото')).toHaveAttribute('src', 'blob:preview')
    expect(screen.getByRole('button', { name: 'Аналізуємо...' })).toBeDisabled()
  })
})

describe('AnalysisResult', () => {
  it('renders loading and empty states', () => {
    const { rerender } = render(<AnalysisResult analysis={null} isLoading />)
    expect(screen.getByText('Завантаження...')).toBeInTheDocument()

    rerender(<AnalysisResult analysis={null} isLoading={false} />)
    expect(
      screen.getByText('Виберіть фото або запис з історії.'),
    ).toBeInTheDocument()
  })

  it('renders the full analysis with top predictions and info', () => {
    render(<AnalysisResult analysis={analysis} isLoading={false} />)

    expect(screen.getByRole('heading', { name: 'Robin' })).toBeInTheDocument()
    expect(screen.getByText('91.2%')).toBeInTheDocument()
    expect(screen.getByText('A small bird')).toBeInTheDocument()
    expect(screen.getByText('TOP-3')).toBeInTheDocument()
    expect(screen.getByText('Вільшанка')).toBeInTheDocument()
    expect(screen.getByText('Erithacus rubecula')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Джерело' })).toHaveAttribute(
      'href',
      'https://example.com/robin',
    )
    expect(screen.getByAltText('Robin')).toHaveAttribute(
      'src',
      'http://127.0.0.1:8000/uploads/robin.jpg',
    )
  })

  it('shows warnings and fallbacks for sparse results', () => {
    render(
      <AnalysisResult
        analysis={{
          ...analysis,
          image_url: null,
          description: null,
          source: null,
          top3: [],
          info: null,
          low_confidence: true,
        }}
        isLoading={false}
      />,
    )

    expect(
      screen.getByText('Низька впевненість: результат може бути неточним.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Опис відсутній.')).toBeInTheDocument()
    expect(screen.queryByText('TOP-3')).not.toBeInTheDocument()
    expect(screen.queryByText('Про вид')).not.toBeInTheDocument()
  })

  it('renders empty info values as dashes', () => {
    render(
      <AnalysisResult
        analysis={{
          ...analysis,
          info: { ...analysis.info!, ukrainian: '   ', scientific: null },
        }}
        isLoading={false}
      />,
    )

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })
})

describe('HistoryList', () => {
  function renderHistory(overrides: Partial<Parameters<typeof HistoryList>[0]> = {}) {
    const props: Parameters<typeof HistoryList>[0] = {
      items: [analysis],
      total: 1,
      activeId: null,
      query: '',
      appliedQuery: '',
      isLoading: false,
      onQueryChange: vi.fn(),
      onSearch: vi.fn(),
      onClear: vi.fn(),
      onRefresh: vi.fn(),
      onSelect: vi.fn(),
      onDelete: vi.fn(),
      ...overrides,
    }

    return { ...render(<HistoryList {...props} />), props }
  }

  it('renders loading and empty states', () => {
    const { rerender, props } = renderHistory({ isLoading: true })
    expect(screen.getByText('Завантаження...')).toBeInTheDocument()

    rerender(<HistoryList {...props} isLoading={false} items={[]} total={0} />)
    expect(screen.getByText('Записів не знайдено.')).toBeInTheDocument()
  })

  it('renders items, thumbnails and handles actions', () => {
    const { props } = renderHistory({
      activeId: 1,
      query: 'robin',
      appliedQuery: 'robin',
    })

    expect(screen.getByText('Robin')).toBeInTheDocument()
    expect(screen.getByText(/robin\.jpg/)).toBeInTheDocument()
    expect(screen.getByAltText('')).toHaveAttribute(
      'src',
      'http://127.0.0.1:8000/uploads/robin.jpg',
    )
    expect(screen.getByText(/запит: robin/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Деталі' }))
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }))
    fireEvent.click(screen.getByRole('button', { name: 'Скинути' }))
    fireEvent.click(screen.getByRole('button', { name: 'Оновити' }))

    expect(props.onSelect).toHaveBeenCalledWith(1)
    expect(props.onDelete).toHaveBeenCalledWith(1)
    expect(props.onClear).toHaveBeenCalledOnce()
    expect(props.onRefresh).toHaveBeenCalledOnce()
  })

  it('shows initials when there is no thumbnail', () => {
    renderHistory({ items: [{ ...analysis, image_url: null }] })

    expect(screen.getByText('RO')).toBeInTheDocument()
  })

  it('submits the search form', () => {
    const { props } = renderHistory()

    fireEvent.change(screen.getByPlaceholderText('Вид або назва файлу'), {
      target: { value: 'sparrow' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Знайти' }))

    expect(props.onQueryChange).toHaveBeenCalledWith('sparrow')
    expect(props.onSearch).toHaveBeenCalledOnce()
  })
})

describe('StatsPanel', () => {
  it('renders loading and unavailable states', () => {
    const { rerender } = render(
      <StatsPanel
        stats={null}
        isLoading
        isExporting={false}
        total={0}
        onExport={vi.fn()}
      />,
    )
    expect(screen.getByText('Завантаження...')).toBeInTheDocument()

    rerender(
      <StatsPanel
        stats={null}
        isLoading={false}
        isExporting={false}
        total={0}
        onExport={vi.fn()}
      />,
    )
    expect(screen.getByText('Статистика недоступна.')).toBeInTheDocument()
  })

  it('renders stats and handles export', () => {
    const onExport = vi.fn()

    render(
      <StatsPanel
        stats={stats}
        isLoading={false}
        isExporting={false}
        total={3}
        onExport={onExport}
      />,
    )

    expect(screen.getByText('Всього аналізів: 3')).toBeInTheDocument()
    expect(screen.getByText('Унікальних видів: 2')).toBeInTheDocument()
    expect(screen.getByText('Середня впевненість: 75.0%')).toBeInTheDocument()
    expect(screen.getByText(/Robin — 95\.0%/)).toBeInTheDocument()
    expect(screen.getByText(/Sparrow — 40\.0%/)).toBeInTheDocument()
    expect(screen.getByText(/Robin — 2/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Експорт CSV' }))
    expect(onExport).toHaveBeenCalledOnce()
  })

  it('disables export while empty or busy', () => {
    const { rerender } = render(
      <StatsPanel
        stats={{ ...stats, top_species: [] }}
        isLoading={false}
        isExporting
        total={0}
        onExport={vi.fn()}
      />,
    )

    expect(screen.getByText('Даних ще немає.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Експортуємо...' })).toBeDisabled()

    rerender(
      <StatsPanel
        stats={stats}
        isLoading={false}
        isExporting
        total={3}
        onExport={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Експортуємо...' })).toBeDisabled()
  })
})

describe('WalletCard', () => {
  function renderWallet(overrides: Partial<Parameters<typeof WalletCard>[0]> = {}) {
    const props: Parameters<typeof WalletCard>[0] = {
      config: paymentConfig,
      wallet: null,
      address: null,
      isConnecting: false,
      isPaying: false,
      isChecking: false,
      txHash: '',
      onConnect: vi.fn(),
      onPay: vi.fn(),
      onCheck: vi.fn(),
      onTxHashChange: vi.fn(),
      ...overrides,
    }

    return { ...render(<WalletCard {...props} />), props }
  }

  it('shows the connect button when no wallet is connected', () => {
    const { props } = renderWallet()

    expect(screen.getByText(/5 аналізів за 0.002 ETH/)).toBeInTheDocument()
    expect(screen.getByText(paymentConfig.receiver)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Підключити MetaMask' }))
    expect(props.onConnect).toHaveBeenCalledOnce()
  })

  it('shows the connecting state', () => {
    renderWallet({ isConnecting: true })

    expect(
      screen.getByRole('button', { name: 'Підключаємо...' }),
    ).toBeDisabled()
  })

  it('shows balance, actions and the explorer link', () => {
    const { props } = renderWallet({
      address: wallet.wallet_address,
      wallet,
      txHash: '0x123',
    })

    expect(screen.getByText('0xabcd…0001')).toBeInTheDocument()
    expect(screen.getByText('5 аналізів')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Остання транзакція в оглядачі' }),
    ).toHaveAttribute(
      'href',
      `https://explorer.test/tx/${wallet.last_transaction_hash}`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Купити 5 аналізів' }))
    fireEvent.click(screen.getByRole('button', { name: 'Перевірити оплату' }))
    fireEvent.change(screen.getByPlaceholderText('Хеш транзакції 0x...'), {
      target: { value: '0xabc' },
    })

    expect(props.onPay).toHaveBeenCalledOnce()
    expect(props.onCheck).toHaveBeenCalledOnce()
    expect(props.onTxHashChange).toHaveBeenCalledWith('0xabc')
  })

  it('shows busy labels and unknown balance', () => {
    renderWallet({
      address: wallet.wallet_address,
      wallet: null,
      isPaying: true,
      isChecking: true,
    })

    expect(screen.getByText('Баланс невідомий')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Очікуємо підтвердження...' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Перевіряємо...' }),
    ).toBeDisabled()
  })

  it('hides the explorer link without a transaction or explorer url', () => {
    const { rerender } = renderWallet({
      address: wallet.wallet_address,
      wallet: { ...wallet, last_transaction_hash: null },
    })

    expect(
      screen.queryByRole('link', { name: 'Остання транзакція в оглядачі' }),
    ).not.toBeInTheDocument()

    rerender(
      <WalletCard
        config={{ ...paymentConfig, explorer_url: '' }}
        wallet={wallet}
        address={wallet.wallet_address}
        isConnecting={false}
        isPaying={false}
        isChecking={false}
        txHash=''
        onConnect={vi.fn()}
        onPay={vi.fn()}
        onCheck={vi.fn()}
        onTxHashChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('link', { name: 'Остання транзакція в оглядачі' }),
    ).not.toBeInTheDocument()
  })
})
