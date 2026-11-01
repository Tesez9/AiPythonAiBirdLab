export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatDate(value: string): string {
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value}Z`
  const date = new Date(normalized)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  const pad = (part: number) => String(part).padStart(2, '0')

  return [
    `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(' · ')
}

export function formatBytes(value?: number | null): string {
  if (!value) {
    return ''
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} КБ`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} МБ`
}

export function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return 'Не вдалося з’єднатися з сервером. Перевірте, чи він запущений і доступний у вашій мережі.'
  }

  return error instanceof Error ? error.message : 'Невідома помилка'
}
