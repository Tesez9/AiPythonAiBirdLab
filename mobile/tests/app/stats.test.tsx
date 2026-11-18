import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Sharing from 'expo-sharing'

import StatsScreen from '@/app/(tabs)/stats'
import { downloadCsv, getStats } from '@/lib/api'

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual('react')
    React.useEffect(callback, [callback])
  },
}))

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}))

jest.mock('@/lib/api', () => ({
  CSV_URL: 'http://api.test/api/export.csv',
  downloadCsv: jest.fn(),
  getStats: jest.fn(),
}))

const analysis = {
  id: 1,
  image_name: 'robin.jpg',
  image_url: '/uploads/robin.jpg',
  predicted_species: 'Robin',
  confidence: 0.95,
  low_confidence: false,
  analysis_date: '2026-01-02T03:04:05',
  description: 'A small bird',
  source: null,
}

const stats = {
  total: 3,
  unique_species: 2,
  average_confidence: 0.75,
  highest: analysis,
  lowest: { ...analysis, id: 2, predicted_species: 'Sparrow', confidence: 0.4 },
  top_species: [
    { species: 'Robin', count: 2 },
    { species: 'Sparrow', count: 1 },
  ],
}

const emptyStats = {
  total: 0,
  unique_species: 0,
  average_confidence: 0,
  highest: null,
  lowest: null,
  top_species: [],
}

beforeEach(() => {
  jest.mocked(getStats).mockResolvedValue(stats)
  jest.mocked(downloadCsv).mockResolvedValue({ uri: 'cache/bird.csv' } as never)
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true)
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined)
})

describe('StatsScreen', () => {
  it('renders the statistics summary', async () => {
    await render(<StatsScreen />)

    expect(await screen.findByText('Всього аналізів')).toBeOnTheScreen()
    expect(screen.getByText('Унікальних видів')).toBeOnTheScreen()
    expect(screen.getByText('75.0%')).toBeOnTheScreen()
    expect(screen.getByText('3 записів')).toBeOnTheScreen()
    expect(screen.getByText('95.0%')).toBeOnTheScreen()
    expect(screen.getByText('40.0%')).toBeOnTheScreen()
    expect(screen.getAllByText('Robin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sparrow').length).toBeGreaterThan(0)
    expect(screen.getByText('Рекорди')).toBeOnTheScreen()
    expect(screen.getByText('Найчастіші види')).toBeOnTheScreen()
  })

  it('renders empty statistics', async () => {
    jest.mocked(getStats).mockResolvedValue(emptyStats)

    await render(<StatsScreen />)

    expect(await screen.findByText('Даних ще немає.')).toBeOnTheScreen()
    expect(screen.getByText('0.0%')).toBeOnTheScreen()
    expect(
      screen.getByRole('button', { name: /Експортувати CSV/ }),
    ).toBeDisabled()
    expect(screen.getAllByText('—').length).toBe(2)
  })

  it('exports through the native share sheet', async () => {
    await render(<StatsScreen />)
    await screen.findByText('Всього аналізів')

    await fireEvent.press(
      screen.getByRole('button', { name: /Експортувати CSV/ }),
    )

    expect(
      await screen.findByText('Експортовано 3 записів.'),
    ).toBeOnTheScreen()
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    expect(Sharing.shareAsync).toHaveBeenCalledWith('cache/bird.csv', {
      dialogTitle: 'Експорт CSV',
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    })
  })

  it('reports when sharing is unavailable', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false)

    await render(<StatsScreen />)
    await screen.findByText('Всього аналізів')

    await fireEvent.press(
      screen.getByRole('button', { name: /Експортувати CSV/ }),
    )

    expect(
      await screen.findByText(
        'CSV збережено у кеші застосунку: cache/bird.csv',
      ),
    ).toBeOnTheScreen()
    expect(Sharing.shareAsync).not.toHaveBeenCalled()
  })

  it('reports export errors', async () => {
    jest.mocked(downloadCsv).mockRejectedValue(new Error('export down'))

    await render(<StatsScreen />)
    await screen.findByText('Всього аналізів')

    await fireEvent.press(
      screen.getByRole('button', { name: /Експортувати CSV/ }),
    )

    expect(await screen.findByText('export down')).toBeOnTheScreen()
  })

  it('shows the error state and retries', async () => {
    jest.mocked(getStats).mockRejectedValueOnce(new Error('load down'))

    await render(<StatsScreen />)

    expect(await screen.findByText('Статистика недоступна')).toBeOnTheScreen()
    expect(screen.getByText('load down')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Спробувати ще раз' }))

    expect(await screen.findByText('Всього аналізів')).toBeOnTheScreen()
    expect(getStats).toHaveBeenCalledTimes(2)
  })

  it('closes the error banner', async () => {
    jest.mocked(getStats).mockRejectedValueOnce(new Error('load down'))

    await render(<StatsScreen />)

    await screen.findByText('load down')
    await fireEvent.press(screen.getByLabelText('Закрити'))

    expect(screen.queryByText('load down')).not.toBeOnTheScreen()
  })
})
