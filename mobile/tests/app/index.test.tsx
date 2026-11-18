import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { AppState } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import * as Linking from 'expo-linking'

import AnalyzeScreen from '@/app/(tabs)/index'
import {
  analyzeImage,
  ApiError,
  checkPayments,
  fetchHealth,
  fetchPaymentConfig,
  fetchWallet,
  validateImageAsset,
} from '@/lib/api'

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}))

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}))

jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
}))

jest.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number
    detail: unknown

    constructor(status: number, message: string, detail?: unknown) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.detail = detail
    }
  }

  return {
    API_BASE: 'http://api.test',
    ApiError: MockApiError,
    analyzeImage: jest.fn(),
    assetName: (asset: { fileName?: string; uri: string }) =>
      asset.fileName || asset.uri.split('/').pop() || 'Фото',
    assetUrl: (path: string | null | undefined) =>
      path ? (path.startsWith('http') ? path : `http://api.test${path}`) : null,
    checkPayments: jest.fn(),
    fetchHealth: jest.fn(),
    fetchPaymentConfig: jest.fn(),
    fetchWallet: jest.fn(),
    validateImageAsset: jest.fn(),
  }
})

const ADDRESS = '0xabcdef0000000000000000000000000000000001'
const TX_HASH = '0x' + 'ab'.repeat(32)

const analysis = {
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

const wallet = {
  wallet_address: ADDRESS,
  credits: 5,
  price_wei: '2000000000000000',
  package_credits: 5,
  last_transaction_hash: null,
}

const disabledConfig = {
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

const enabledConfig = { ...disabledConfig, enabled: true }

const asset = {
  uri: 'file:///photos/bird.jpg',
  fileName: 'bird.jpg',
  mimeType: 'image/jpeg',
  fileSize: 2048,
} as ImagePicker.ImagePickerAsset

function pickerResult(result: Partial<ImagePicker.ImagePickerResult>) {
  return { canceled: false, assets: [asset], ...result } as ImagePicker.ImagePickerResult
}

async function renderScreen() {
  await render(<AnalyzeScreen />)
  await screen.findByText('Онлайн')
}

async function saveWallet() {
  await fireEvent.changeText(screen.getByPlaceholderText('0x...'), ADDRESS)
  await fireEvent.press(screen.getByRole('button', { name: 'Зберегти гаманець' }))
  await screen.findByText(/Гаманець збережено/)
}

async function pickLibraryPhoto() {
  await fireEvent.press(screen.getByRole('button', { name: 'Галерея' }))
  await screen.findByText('bird.jpg')
}

beforeEach(() => {
  jest.mocked(fetchHealth).mockResolvedValue({
    status: 'ok',
    database: 'ok',
    ai_server: 'ok',
    ai_url: 'http://ai.test',
  })
  jest.mocked(fetchPaymentConfig).mockResolvedValue(disabledConfig)
  jest.mocked(fetchWallet).mockResolvedValue(wallet)
  jest.mocked(analyzeImage).mockResolvedValue(analysis)
  jest.mocked(checkPayments).mockResolvedValue({
    status: 'credited',
    credits: 5,
    transaction_hash: TX_HASH,
  })
  jest.mocked(validateImageAsset).mockReturnValue(null)
  jest
    .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
    .mockResolvedValue({ granted: true } as ImagePicker.MediaLibraryPermissionResponse)
  jest
    .mocked(ImagePicker.requestCameraPermissionsAsync)
    .mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse)
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValue({ canceled: true, assets: null } as ImagePicker.ImagePickerResult)
  jest
    .mocked(ImagePicker.launchCameraAsync)
    .mockResolvedValue({ canceled: true, assets: null } as ImagePicker.ImagePickerResult)
  jest.mocked(Linking.openURL).mockResolvedValue(true)
})

describe('AnalyzeScreen initial state', () => {
  it('shows the online health state and no payment card', async () => {
    await renderScreen()

    expect(screen.getByText('AI Bird Lab')).toBeOnTheScreen()
    expect(screen.getByText('Онлайн')).toBeOnTheScreen()
    expect(screen.getByText('Аналіз фото')).toBeOnTheScreen()
    expect(screen.queryByText('Оплата аналізів')).not.toBeOnTheScreen()
  })

  it('shows offline when health check fails', async () => {
    jest.mocked(fetchHealth).mockRejectedValue(new Error('down'))

    await render(<AnalyzeScreen />)

    expect(await screen.findByText('Offline')).toBeOnTheScreen()
  })

  it('shows AI offline for a degraded status', async () => {
    jest.mocked(fetchHealth).mockResolvedValue({
      status: 'degraded',
      database: 'ok',
      ai_server: 'down',
      ai_url: 'http://ai.test',
    })

    await render(<AnalyzeScreen />)

    expect(await screen.findByText('AI offline')).toBeOnTheScreen()
  })

  it('ignores payment config failures', async () => {
    jest.mocked(fetchPaymentConfig).mockRejectedValue(new Error('no config'))

    await renderScreen()

    expect(screen.queryByText('Оплата аналізів')).not.toBeOnTheScreen()
  })

  it('opens the history from the empty result card', async () => {
    await renderScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Відкрити історію' }))

    expect(mockRouter.push).toHaveBeenCalledWith('/history')
  })
})

describe('photo picking', () => {
  it('rejects denied library permission', async () => {
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValue({ granted: false } as ImagePicker.MediaLibraryPermissionResponse)

    await renderScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Галерея' }))

    expect(
      await screen.findByText('Потрібен дозвіл на доступ до галереї.'),
    ).toBeOnTheScreen()
  })

  it('rejects denied camera permission', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse)

    await renderScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Камера' }))

    expect(
      await screen.findByText('Потрібен дозвіл на використання камери.'),
    ).toBeOnTheScreen()
  })

  it('accepts a library photo and can remove it', async () => {
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue(pickerResult({}))

    await renderScreen()
    await pickLibraryPhoto()

    expect(
      screen.container
        .queryAll((node) => node.type === 'Image')
        .map((node) => node.props.source),
    ).toContainEqual({
      uri: 'file:///photos/bird.jpg',
    })
    expect(screen.getByText('2 КБ')).toBeOnTheScreen()

    await fireEvent.press(screen.getByLabelText('Прибрати фото'))

    expect(screen.queryByText('bird.jpg')).not.toBeOnTheScreen()
  })

  it('accepts a camera photo', async () => {
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValue(pickerResult({}))

    await renderScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Камера' }))

    expect(await screen.findByText('bird.jpg')).toBeOnTheScreen()
  })

  it('ignores a canceled picker', async () => {
    await renderScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Галерея' }))

    expect(screen.queryByText('bird.jpg')).not.toBeOnTheScreen()
  })

  it('reports validation errors', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(pickerResult({}))
    jest
      .mocked(validateImageAsset)
      .mockReturnValueOnce('Підтримуються лише JPG, JPEG і PNG.')

    await renderScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Галерея' }))

    expect(
      await screen.findByText('Підтримуються лише JPG, JPEG і PNG.'),
    ).toBeOnTheScreen()
  })

  it('reports picker failures', async () => {
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockRejectedValue(new Error('picker broke'))

    await renderScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Галерея' }))

    expect(await screen.findByText('picker broke')).toBeOnTheScreen()
  })
})

describe('analysis flow', () => {
  it('analyzes a free photo and clears the result', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(pickerResult({}))

    await renderScreen()
    await pickLibraryPhoto()
    await fireEvent.press(screen.getByRole('button', { name: 'Аналізувати фото' }))

    expect(await screen.findByText('Розпізнано: Robin.')).toBeOnTheScreen()
    expect(analyzeImage).toHaveBeenCalledWith(asset, null)
    expect(screen.queryByText('bird.jpg')).not.toBeOnTheScreen()
    expect(screen.getAllByText('Robin').length).toBeGreaterThan(0)

    await fireEvent.press(screen.getByRole('button', { name: 'Очистити' }))

    expect(screen.queryByText('Результат')).not.toBeOnTheScreen()
    expect(screen.getByText('Тут з’явиться результат')).toBeOnTheScreen()
  })

  it('requires a saved wallet when payments are enabled', async () => {
    jest.mocked(fetchPaymentConfig).mockResolvedValue(enabledConfig)
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(pickerResult({}))

    await renderScreen()
    await pickLibraryPhoto()
    await fireEvent.press(screen.getByRole('button', { name: 'Аналізувати фото' }))

    expect(
      await screen.findByText('Збережіть адресу гаманця, щоб оплатити аналіз.'),
    ).toBeOnTheScreen()
    expect(analyzeImage).not.toHaveBeenCalled()
  })

  it('analyzes a paid photo and updates the wallet balance', async () => {
    jest.mocked(fetchPaymentConfig).mockResolvedValue(enabledConfig)
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(pickerResult({}))
    jest.mocked(analyzeImage).mockResolvedValue({ ...analysis, credits_left: 4 })

    await renderScreen()
    await saveWallet()
    await pickLibraryPhoto()
    await fireEvent.press(screen.getByRole('button', { name: 'Аналізувати фото' }))

    expect(await screen.findByText('Розпізнано: Robin.')).toBeOnTheScreen()
    expect(analyzeImage).toHaveBeenCalledWith(asset, ADDRESS)
    expect(screen.getByText('4 аналізи')).toBeOnTheScreen()
  })

  it('reports exhausted credits', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(pickerResult({}))
    jest.mocked(analyzeImage).mockRejectedValue(new ApiError(402, 'Payment required'))

    await renderScreen()
    await pickLibraryPhoto()
    await fireEvent.press(screen.getByRole('button', { name: 'Аналізувати фото' }))

    expect(
      await screen.findByText(
        'Оплачені аналізи закінчилися. Придбайте новий пакет через MetaMask.',
      ),
    ).toBeOnTheScreen()
  })

  it('reports generic analysis errors', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue(pickerResult({}))
    jest.mocked(analyzeImage).mockRejectedValue(new Error('AI down'))

    await renderScreen()
    await pickLibraryPhoto()
    await fireEvent.press(screen.getByRole('button', { name: 'Аналізувати фото' }))

    expect(await screen.findByText('AI down')).toBeOnTheScreen()
  })
})

describe('wallet and payments', () => {
  beforeEach(() => {
    jest.mocked(fetchPaymentConfig).mockResolvedValue(enabledConfig)
  })

  it('validates the wallet address', async () => {
    await renderScreen()
    await fireEvent.changeText(screen.getByPlaceholderText('0x...'), 'not-an-address')
    await fireEvent.press(screen.getByRole('button', { name: 'Зберегти гаманець' }))

    expect(
      await screen.findByText('Введіть коректну адресу гаманця у форматі 0x...'),
    ).toBeOnTheScreen()
  })

  it('saves a wallet and shows the short address', async () => {
    await renderScreen()
    await saveWallet()

    expect(screen.getByText(/0xabcd…0001/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Оновити гаманець' })).toBeOnTheScreen()
    expect(screen.getByText('5 аналізів')).toBeOnTheScreen()
  })

  it('reports wallet lookup errors', async () => {
    jest.mocked(fetchWallet).mockRejectedValue(new Error('wallet failed'))

    await renderScreen()
    await fireEvent.changeText(screen.getByPlaceholderText('0x...'), ADDRESS)
    await fireEvent.press(screen.getByRole('button', { name: 'Зберегти гаманець' }))

    expect(await screen.findByText('wallet failed')).toBeOnTheScreen()
  })

  it('opens MetaMask and waits for the app to become active', async () => {
    const remove = jest.fn()
    const addEventListener = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove } as never)

    await renderScreen()
    await saveWallet()
    await fireEvent.press(
      screen.getByRole('button', { name: /Оплатити 0\.002 ETH/ }),
    )

    expect(Linking.openURL).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(
        'Підтвердіть оплату в MetaMask. Після повернення в застосунок баланс перевіриться автоматично.',
      ),
    ).toBeOnTheScreen()
    expect(screen.getByText('Очікуємо повернення...')).toBeOnTheScreen()

    const handler = addEventListener.mock.calls.at(-1)![1] as (state: string) => void

    await act(async () => {
      handler('active')
    })

    expect(await screen.findByText(/Оплату зараховано: 5 аналізів/)).toBeOnTheScreen()
    expect(checkPayments).toHaveBeenCalledWith(ADDRESS)
    expect(remove).toHaveBeenCalled()
  })

  it('reports a MetaMask launch failure', async () => {
    jest.mocked(Linking.openURL).mockRejectedValue(new Error('no app'))

    await renderScreen()
    await saveWallet()
    await fireEvent.press(
      screen.getByRole('button', { name: /Оплатити 0\.002 ETH/ }),
    )

    expect(
      await screen.findByText(
        'Не вдалося відкрити MetaMask. Перевірте, чи встановлений застосунок MetaMask.',
      ),
    ).toBeOnTheScreen()
  })

  it('credits a checked payment', async () => {
    await renderScreen()
    await saveWallet()
    await fireEvent.press(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(await screen.findByText(/Оплату зараховано: 5 аналізів/)).toBeOnTheScreen()
    expect(checkPayments).toHaveBeenCalledWith(ADDRESS)
    expect(fetchWallet).toHaveBeenCalledWith(ADDRESS)
  })

  it('shows a pending payment', async () => {
    jest.mocked(checkPayments).mockResolvedValue({
      status: 'pending',
      transaction_hash: TX_HASH,
      confirmations: 0,
      required: 1,
    })

    await renderScreen()
    await saveWallet()
    await fireEvent.press(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(
      await screen.findByText('Транзакція ще не підтверджена: 0/1.'),
    ).toBeOnTheScreen()
  })

  it('explains a missing payment', async () => {
    jest.mocked(checkPayments).mockRejectedValue(new ApiError(404, 'not found'))

    await renderScreen()
    await saveWallet()
    await fireEvent.press(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(
      await screen.findByText(
        'Нову оплату не знайдено. Переконайтеся, що транзакція підтверджена.',
      ),
    ).toBeOnTheScreen()
  })

  it('reports payment check failures', async () => {
    jest.mocked(checkPayments).mockRejectedValue(new Error('rpc down'))

    await renderScreen()
    await saveWallet()
    await fireEvent.press(screen.getByRole('button', { name: 'Перевірити оплату' }))

    expect(await screen.findByText('rpc down')).toBeOnTheScreen()
  })
})
