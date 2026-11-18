import type { PaymentConfig } from '@/lib/api'

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/

export function isValidAddress(value: string): boolean {
  return ADDRESS_PATTERN.test(value.trim())
}

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase()
}

export function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value
}

export function creditsLabel(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} аналіз`
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} аналізи`
  }

  return `${count} аналізів`
}

export function metamaskPaymentUrl(config: PaymentConfig): string {
  return `https://link.metamask.io/send/${config.receiver}@${config.chain_id}?value=${config.price_wei}`
}
