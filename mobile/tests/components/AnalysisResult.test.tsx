import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

import { AnalysisResult } from '@/components/AnalysisResult'
import type { Analysis } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  assetUrl: (path: string | null | undefined) =>
    path ? (path.startsWith('http') ? path : `http://api.test${path}`) : null,
}))

function makeAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
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
      facts: 'Співає',
      status: 'LC',
      description: 'Опис',
      source: 'https://example.com',
    },
    ...overrides,
  }
}

function imageSources() {
  return screen.container
    .queryAll((node) => node.type === 'Image')
    .map((node) => node.props.source)
}

describe('AnalysisResult', () => {
  let openURL: jest.SpyInstance

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
  })

  it('renders the full analysis', async () => {
    await render(<AnalysisResult analysis={makeAnalysis()} />)

    expect(imageSources()).toContainEqual({
      uri: 'http://api.test/uploads/robin.jpg',
    })
    expect(screen.getAllByText('Robin').length).toBeGreaterThan(0)
    expect(screen.getAllByText('91.2%').length).toBeGreaterThan(0)
    expect(screen.getByText('A small bird')).toBeOnTheScreen()
    expect(screen.getByText('TOP-3')).toBeOnTheScreen()
    expect(screen.getByText('Sparrow')).toBeOnTheScreen()
    expect(screen.getByText('3.0%')).toBeOnTheScreen()
    expect(screen.getByText('Про вид')).toBeOnTheScreen()
    expect(screen.getByText('Вільшанка')).toBeOnTheScreen()
    expect(screen.getAllByText('Erithacus rubecula').length).toBeGreaterThan(0)
    expect(screen.getByText('Ліси')).toBeOnTheScreen()
    expect(screen.getByText('Співає')).toBeOnTheScreen()
  })

  it('opens the source link', async () => {
    await render(<AnalysisResult analysis={makeAnalysis()} />)

    await fireEvent.press(screen.getByText('Відкрити джерело'))

    expect(openURL).toHaveBeenCalledWith('https://example.com/robin')
  })

  it('ignores failures when opening the source link', async () => {
    openURL.mockRejectedValueOnce(new Error('no browser'))

    await render(<AnalysisResult analysis={makeAnalysis()} />)
    await fireEvent.press(screen.getByText('Відкрити джерело'))

    expect(openURL).toHaveBeenCalledTimes(1)
  })

  it('renders fallbacks for sparse results', async () => {
    await render(
      <AnalysisResult
        analysis={makeAnalysis({
          image_url: null,
          description: null,
          source: null,
          top3: [],
          info: null,
          low_confidence: true,
        })}
      />,
    )

    expect(screen.getByText('Фото недоступне')).toBeOnTheScreen()
    expect(
      screen.getByText('Низька впевненість: результат може бути неточним.'),
    ).toBeOnTheScreen()
    expect(screen.getByText('Опис відсутній.')).toBeOnTheScreen()
    expect(screen.queryByText('Відкрити джерело')).not.toBeOnTheScreen()
    expect(screen.queryByText('TOP-3')).not.toBeOnTheScreen()
    expect(screen.queryByText('Про вид')).not.toBeOnTheScreen()
  })

  it('renders empty info values as dashes', async () => {
    await render(
      <AnalysisResult
        analysis={makeAnalysis({
          info: {
            ...makeAnalysis().info!,
            ukrainian: '   ',
            scientific: null,
            family: null,
          },
        })}
      />,
    )

    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3)
  })

  it('falls back to the family or a generic subtitle', async () => {
    const base = makeAnalysis()

    const { rerender } = await render(
      <AnalysisResult
        analysis={makeAnalysis({
          info: { ...base.info!, scientific: null, family: 'Muscicapidae' },
        })}
      />,
    )

    expect(screen.getAllByText('Muscicapidae').length).toBeGreaterThan(0)

    await rerender(
      <AnalysisResult
        analysis={makeAnalysis({
          info: { ...base.info!, scientific: null, family: null },
        })}
      />,
    )

    expect(screen.getByText('Довідник видів')).toBeOnTheScreen()
  })

  it('clamps top prediction bars to safe values', async () => {
    await render(
      <AnalysisResult
        analysis={makeAnalysis({
          confidence: 0.7,
          top3: [
            { species: 'Zero', confidence: 0 },
            { species: 'Two', confidence: 2 },
            { species: 'Mid', confidence: 0.6 },
          ],
        })}
      />,
    )

    expect(screen.getByText('0.0%')).toBeOnTheScreen()
    expect(screen.getByText('200.0%')).toBeOnTheScreen()
    expect(screen.getByText('60.0%')).toBeOnTheScreen()
  })

  it('renders absolute image urls as-is', async () => {
    await render(
      <AnalysisResult
        analysis={makeAnalysis({ image_url: 'https://cdn.test/robin.jpg' })}
      />,
    )

    expect(imageSources()).toContainEqual({
      uri: 'https://cdn.test/robin.jpg',
    })
  })

  it('renders the low confidence warning for a warning tone', async () => {
    await render(
      <AnalysisResult
        analysis={makeAnalysis({ confidence: 0.4, low_confidence: true })}
      />,
    )

    expect(screen.getByText('40.0%')).toBeOnTheScreen()
    expect(
      screen.getByText('Низька впевненість: результат може бути неточним.'),
    ).toBeOnTheScreen()
  })
})
