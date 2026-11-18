import {
  creditsLabel,
  isValidAddress,
  metamaskPaymentUrl,
  normalizeAddress,
  shortAddress,
} from '@/lib/wallet'
import type { PaymentConfig } from '@/lib/api'

const config: PaymentConfig = {
  enabled: true,
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

describe('wallet helpers', () => {
  it('validates addresses', () => {
    expect(isValidAddress('0xAbCdEf0000000000000000000000000000000001')).toBe(true)
    expect(isValidAddress(' 0xAbCdEf0000000000000000000000000000000001 ')).toBe(true)
    expect(isValidAddress('0x123')).toBe(false)
    expect(isValidAddress('')).toBe(false)
  })

  it('normalizes and shortens addresses', () => {
    expect(normalizeAddress(' 0xAbC ')).toBe('0xabc')
    expect(shortAddress('0x1234567890abcdef')).toBe('0x1234…cdef')
    expect(shortAddress('0x1234')).toBe('0x1234')
  })

  it('declines credits in Ukrainian', () => {
    expect(creditsLabel(1)).toBe('1 аналіз')
    expect(creditsLabel(21)).toBe('21 аналіз')
    expect(creditsLabel(2)).toBe('2 аналізи')
    expect(creditsLabel(4)).toBe('4 аналізи')
    expect(creditsLabel(22)).toBe('22 аналізи')
    expect(creditsLabel(5)).toBe('5 аналізів')
    expect(creditsLabel(11)).toBe('11 аналізів')
    expect(creditsLabel(12)).toBe('12 аналізів')
    expect(creditsLabel(14)).toBe('14 аналізів')
    expect(creditsLabel(0)).toBe('0 аналізів')
  })

  it('builds a MetaMask payment link', () => {
    expect(metamaskPaymentUrl(config)).toBe(
      'https://link.metamask.io/send/0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f@31337?value=2000000000000000',
    )
  })
})
