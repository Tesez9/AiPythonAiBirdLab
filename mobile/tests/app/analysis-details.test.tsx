import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useRouter } from 'expo-router'

import AnalysisDetailsScreen from '@/app/analysis/[id]'
import { deleteAnalysis, getAnalysis } from '@/lib/api'

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

  return {
    useRouter: () => router,
    useLocalSearchParams: () =>
      (globalThis as { __PARAMS__?: { id: string } }).__PARAMS__ ?? { id: '1' },
  }
})

jest.mock('@/lib/api', () => ({
  assetUrl: (path: string | null | undefined) =>
    path ? (path.startsWith('http') ? path : `http://api.test${path}`) : null,
  deleteAnalysis: jest.fn(),
  getAnalysis: jest.fn(),
}))

const router = useRouter() as unknown as {
  push: jest.Mock
  replace: jest.Mock
  back: jest.Mock
}

const analysis = {
  id: 1,
  image_name: 'robin.jpg',
  image_url: '/uploads/robin.jpg',
  predicted_species: 'Robin',
  confidence: 0.91,
  low_confidence: false,
  analysis_date: '2026-01-02T03:04:05',
  description: 'A small bird',
  source: null,
  top3: [{ species: 'Robin', confidence: 0.91 }],
  info: null,
}

beforeEach(() => {
  ;(globalThis as { __PARAMS__?: { id: string } }).__PARAMS__ = { id: '1' }
  jest.mocked(getAnalysis).mockResolvedValue(analysis)
  jest.mocked(deleteAnalysis).mockResolvedValue({ deleted: 1 })
})

afterEach(() => {
  delete (globalThis as { __PARAMS__?: { id: string } }).__PARAMS__
})

describe('AnalysisDetailsScreen', () => {
  it('loads and renders an analysis', async () => {
    await render(<AnalysisDetailsScreen />)

    expect((await screen.findAllByText('Robin')).length).toBeGreaterThan(0)
    expect(screen.getByText('Деталі аналізу')).toBeOnTheScreen()
    expect(screen.getAllByText('91.0%').length).toBeGreaterThan(0)
    expect(screen.getByText('A small bird')).toBeOnTheScreen()
    expect(getAnalysis).toHaveBeenCalledWith(1)
    expect(
      screen.getByRole('button', { name: /Видалити запис/ }),
    ).toBeOnTheScreen()
  })

  it('navigates back', async () => {
    await render(<AnalysisDetailsScreen />)
    expect((await screen.findAllByText('Robin')).length).toBeGreaterThan(0)

    await fireEvent.press(screen.getByLabelText('Назад'))

    expect(router.back).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid id', async () => {
    ;(globalThis as { __PARAMS__?: { id: string } }).__PARAMS__ = { id: 'abc' }

    await render(<AnalysisDetailsScreen />)

    expect(
      screen.getByText('Некоректний ідентифікатор запису.'),
    ).toBeOnTheScreen()
    expect(screen.getByText('Запис не знайдено')).toBeOnTheScreen()
    expect(getAnalysis).not.toHaveBeenCalled()
  })

  it('returns to history from the not-found state', async () => {
    ;(globalThis as { __PARAMS__?: { id: string } }).__PARAMS__ = { id: '0' }

    await render(<AnalysisDetailsScreen />)

    await fireEvent.press(screen.getByRole('button', { name: 'До історії' }))

    expect(router.replace).toHaveBeenCalledWith('/history')
  })

  it('reports load errors and closes them', async () => {
    jest.mocked(getAnalysis).mockRejectedValue(new Error('load down'))

    await render(<AnalysisDetailsScreen />)

    expect(await screen.findByText('load down')).toBeOnTheScreen()
    expect(screen.getByText('Запис не знайдено')).toBeOnTheScreen()

    await fireEvent.press(screen.getByLabelText('Закрити'))

    expect(screen.queryByText('load down')).not.toBeOnTheScreen()
  })

  it('cancels deletion', async () => {
    await render(<AnalysisDetailsScreen />)
    expect((await screen.findAllByText('Robin')).length).toBeGreaterThan(0)

    await fireEvent.press(
      screen.getByRole('button', { name: /Видалити запис/ }),
    )
    await fireEvent.press(screen.getByText('Скасувати'))

    expect(screen.queryByText('Видалити запис?')).not.toBeOnTheScreen()
    expect(deleteAnalysis).not.toHaveBeenCalled()
  })

  it('deletes the analysis and goes back', async () => {
    await render(<AnalysisDetailsScreen />)
    expect((await screen.findAllByText('Robin')).length).toBeGreaterThan(0)

    await fireEvent.press(
      screen.getByRole('button', { name: /Видалити запис/ }),
    )
    expect(screen.getByText('Видалити запис?')).toBeOnTheScreen()
    await fireEvent.press(screen.getByText('Видалити'))

    await waitFor(() => {
      expect(deleteAnalysis).toHaveBeenCalledWith(1)
      expect(router.back).toHaveBeenCalledTimes(1)
    })
  })

  it('reports delete errors', async () => {
    jest.mocked(deleteAnalysis).mockRejectedValue(new Error('delete down'))

    await render(<AnalysisDetailsScreen />)
    expect((await screen.findAllByText('Robin')).length).toBeGreaterThan(0)

    await fireEvent.press(
      screen.getByRole('button', { name: /Видалити запис/ }),
    )
    await fireEvent.press(screen.getByText('Видалити'))

    expect(await screen.findByText('delete down')).toBeOnTheScreen()
  })
})
