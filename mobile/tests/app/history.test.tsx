import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useRouter } from 'expo-router'

import HistoryScreen from '@/app/(tabs)/history'
import { deleteAnalysis, listAnalyses } from '@/lib/api'

jest.mock('expo-router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

  return {
    useRouter: () => router,
    useFocusEffect: (callback: () => void | (() => void)) => {
      const React = jest.requireActual('react')
      React.useEffect(callback, [callback])
    },
  }
})

jest.mock('@/lib/api', () => ({
  assetUrl: (path: string | null | undefined) =>
    path ? (path.startsWith('http') ? path : `http://api.test${path}`) : null,
  deleteAnalysis: jest.fn(),
  listAnalyses: jest.fn(),
}))

const router = useRouter() as unknown as {
  push: jest.Mock
  replace: jest.Mock
  back: jest.Mock
}

function makeAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    image_name: 'robin.jpg',
    image_url: '/uploads/robin.jpg',
    predicted_species: 'Robin',
    confidence: 0.91,
    low_confidence: false,
    analysis_date: '2026-01-02T03:04:05',
    description: 'A small bird',
    source: null,
    ...overrides,
  }
}

const items = [
  makeAnalysis(),
  makeAnalysis({
    id: 2,
    image_name: 'sparrow.png',
    image_url: null,
    predicted_species: 'Sparrow',
    confidence: 0.7,
  }),
  makeAnalysis({
    id: 3,
    image_name: 'crow.jpg',
    predicted_species: 'Crow',
    confidence: 0.4,
    low_confidence: true,
  }),
]

beforeEach(() => {
  jest.mocked(listAnalyses).mockResolvedValue({ total: items.length, items })
  jest.mocked(deleteAnalysis).mockResolvedValue({ deleted: 1 })
})

describe('HistoryScreen', () => {
  it('loads and renders the list', async () => {
    await render(<HistoryScreen />)

    expect(await screen.findByText('Robin')).toBeOnTheScreen()
    expect(screen.getByText('Знайдено: 3')).toBeOnTheScreen()
    expect(screen.getByText('Sparrow')).toBeOnTheScreen()
    expect(screen.getByText('Crow')).toBeOnTheScreen()
    expect(screen.getByText(/robin\.jpg/)).toBeOnTheScreen()
    expect(screen.getByText('91.0%')).toBeOnTheScreen()
    expect(screen.getByText('70.0%')).toBeOnTheScreen()
    expect(screen.getByText('40.0%')).toBeOnTheScreen()
    expect(screen.getByText('низька впевненість')).toBeOnTheScreen()
    expect(screen.getAllByText('bird').length).toBeGreaterThan(0)
    expect(listAnalyses).toHaveBeenCalledWith('')
  })

  it('shows a loading block while the first page loads', async () => {
    jest.mocked(listAnalyses).mockReturnValue(new Promise(() => {}))

    await render(<HistoryScreen />)

    expect(screen.getByText('Завантажуємо історію...')).toBeOnTheScreen()
  })

  it('shows the empty state', async () => {
    jest.mocked(listAnalyses).mockResolvedValue({ total: 0, items: [] })

    await render(<HistoryScreen />)

    expect(await screen.findByText('Історія порожня')).toBeOnTheScreen()
    expect(
      screen.getByText('Проаналізуйте перше фото — записи з’являться тут.'),
    ).toBeOnTheScreen()
  })

  it('opens analysis details', async () => {
    await render(<HistoryScreen />)

    await fireEvent.press(await screen.findByText('Robin'))

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/analysis/[id]',
      params: { id: '1' },
    })
  })

  it('searches and clears the query', async () => {
    await render(<HistoryScreen />)
    await screen.findByText('Robin')

    await fireEvent.changeText(
      screen.getByPlaceholderText('Вид або назва файлу'),
      '  sparrow  ',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Знайти' }))

    await waitFor(() => {
      expect(listAnalyses).toHaveBeenLastCalledWith('sparrow')
    })
    expect(await screen.findByText('Запит: sparrow')).toBeOnTheScreen()

    await fireEvent.press(screen.getByText('Скинути'))

    await waitFor(() => {
      expect(listAnalyses).toHaveBeenLastCalledWith('')
    })
  })

  it('shows the searched empty state', async () => {
    jest.mocked(listAnalyses).mockResolvedValue({ total: 0, items: [] })

    await render(<HistoryScreen />)
    await screen.findByText('Історія порожня')

    await fireEvent.changeText(
      screen.getByPlaceholderText('Вид або назва файлу'),
      'owl',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Знайти' }))

    expect(await screen.findByText('Нічого не знайдено')).toBeOnTheScreen()
    expect(
      screen.getByText('За запитом «owl» нічого не знайдено.'),
    ).toBeOnTheScreen()
  })

  it('reloads when searching the same query again', async () => {
    await render(<HistoryScreen />)
    await screen.findByText('Robin')

    await fireEvent.changeText(
      screen.getByPlaceholderText('Вид або назва файлу'),
      'robin',
    )
    await fireEvent.press(screen.getByRole('button', { name: 'Знайти' }))
    await waitFor(() => expect(listAnalyses).toHaveBeenCalledTimes(2))

    await fireEvent.press(screen.getByRole('button', { name: 'Знайти' }))

    await waitFor(() => expect(listAnalyses).toHaveBeenCalledTimes(3))
  })

  it('refreshes the list', async () => {
    await render(<HistoryScreen />)
    await screen.findByText('Robin')

    await fireEvent.press(screen.getByRole('button', { name: /Оновити/ }))

    await waitFor(() => expect(listAnalyses).toHaveBeenCalledTimes(2))
  })

  it('confirms and deletes an item', async () => {
    await render(<HistoryScreen />)
    await screen.findByText('Robin')

    await fireEvent.press(screen.getByLabelText('Видалити Robin'))
    expect(screen.getByText('Видалити запис?')).toBeOnTheScreen()
    expect(
      screen.getByText('Robin · robin.jpg. Фото також буде видалено.'),
    ).toBeOnTheScreen()

    await fireEvent.press(screen.getByText('Видалити'))

    expect(
      await screen.findByText('Запис видалено з історії.'),
    ).toBeOnTheScreen()
    expect(deleteAnalysis).toHaveBeenCalledWith(1)
    expect(listAnalyses).toHaveBeenCalledTimes(2)
  })

  it('cancels deletion', async () => {
    await render(<HistoryScreen />)
    await screen.findByText('Robin')

    await fireEvent.press(screen.getByLabelText('Видалити Robin'))
    await fireEvent.press(screen.getByText('Скасувати'))

    expect(screen.queryByText('Видалити запис?')).not.toBeOnTheScreen()
    expect(deleteAnalysis).not.toHaveBeenCalled()
  })

  it('reports load errors and closes them', async () => {
    jest.mocked(listAnalyses).mockRejectedValueOnce(new Error('history down'))

    await render(<HistoryScreen />)

    expect(await screen.findByText('history down')).toBeOnTheScreen()

    await fireEvent.press(screen.getByLabelText('Закрити'))

    expect(screen.queryByText('history down')).not.toBeOnTheScreen()
  })

  it('reports delete errors', async () => {
    jest.mocked(deleteAnalysis).mockRejectedValue(new Error('delete down'))

    await render(<HistoryScreen />)
    await screen.findByText('Robin')

    await fireEvent.press(screen.getByLabelText('Видалити Robin'))
    await fireEvent.press(screen.getByText('Видалити'))

    expect(await screen.findByText('delete down')).toBeOnTheScreen()
  })
})
