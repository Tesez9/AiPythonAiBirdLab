import { errorMessage, formatBytes, formatDate, percent } from '@/lib/format'

describe('percent', () => {
  it('formats confidence values', () => {
    expect(percent(0.756)).toBe('75.6%')
    expect(percent(1)).toBe('100.0%')
    expect(percent(0)).toBe('0.0%')
  })
})

describe('formatDate', () => {
  it('formats dates with and without a timezone', () => {
    expect(formatDate('2026-01-02T03:04:05')).toMatch(
      /^\d{2}\.\d{2}\.\d{4} · \d{2}:\d{2}$/,
    )
    expect(formatDate('2026-01-02T03:04:05Z')).toMatch(
      /^\d{2}\.\d{2}\.\d{4} · \d{2}:\d{2}$/,
    )
    expect(formatDate('2026-01-02T03:04:05+02:00')).toMatch(
      /^\d{2}\.\d{2}\.\d{4} · \d{2}:\d{2}$/,
    )
  })

  it('returns invalid values unchanged', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date')
  })
})

describe('formatBytes', () => {
  it('formats empty, kilobytes and megabytes', () => {
    expect(formatBytes()).toBe('')
    expect(formatBytes(null)).toBe('')
    expect(formatBytes(0)).toBe('')
    expect(formatBytes(500)).toBe('1 КБ')
    expect(formatBytes(2048)).toBe('2 КБ')
    expect(formatBytes(1024 * 1024)).toBe('1.0 МБ')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 МБ')
  })
})

describe('errorMessage', () => {
  it('maps network, generic and unknown errors', () => {
    expect(errorMessage(new TypeError('failed to fetch'))).toBe(
      'Не вдалося з’єднатися з сервером. Перевірте, чи він запущений і доступний у вашій мережі.',
    )
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('text')).toBe('Невідома помилка')
  })
})
