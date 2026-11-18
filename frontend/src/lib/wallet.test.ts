import {
  connectWallet,
  creditsLabel,
  ensureChain,
  getChainId,
  getProvider,
  sendPayment,
  shortAddress,
  walletErrorMessage,
  type EthereumProvider,
} from './wallet'

function providerWith(
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>,
): EthereumProvider {
  return { request }
}

describe('provider helpers', () => {
  afterEach(() => {
    delete window.ethereum
  })

  it('returns the injected provider when present', () => {
    const provider = providerWith(vi.fn())
    window.ethereum = provider

    expect(getProvider()).toBe(provider)
  })

  it('returns null without an injected provider', () => {
    expect(getProvider()).toBeNull()
  })

  it('shortens long addresses only', () => {
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
})

describe('connectWallet', () => {
  afterEach(() => {
    delete window.ethereum
  })

  it('throws when MetaMask is missing', async () => {
    await expect(connectWallet()).rejects.toThrow('MetaMask не знайдено')
  })

  it('throws when no account is returned', async () => {
    window.ethereum = providerWith(vi.fn().mockResolvedValue([]))

    await expect(connectWallet()).rejects.toThrow(
      'MetaMask не повернув жодного акаунта.',
    )
  })

  it('returns the first account in lowercase', async () => {
    window.ethereum = providerWith(
      vi.fn().mockResolvedValue(['0xAbCdEf0000000000000000000000000000000001']),
    )

    await expect(connectWallet()).resolves.toBe(
      '0xabcdef0000000000000000000000000000000001',
    )
  })
})

describe('chain helpers', () => {
  it('parses the chain id from hex', async () => {
    const provider = providerWith(vi.fn().mockResolvedValue('0x7a69'))

    await expect(getChainId(provider)).resolves.toBe(31337)
  })

  it('does nothing when the chain already matches', async () => {
    const request = vi.fn().mockResolvedValue('0x7a69')
    const provider = providerWith(request)

    await ensureChain(provider, {
      chainId: 31337,
      chainName: 'Anvil',
      rpcUrl: 'http://127.0.0.1:8545',
    })

    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith({ method: 'eth_chainId' })
  })

  it('switches to a known chain', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce('0x1')
      .mockResolvedValueOnce(null)
    const provider = providerWith(request)

    await ensureChain(provider, {
      chainId: 31337,
      chainName: 'Anvil',
      rpcUrl: 'http://127.0.0.1:8545',
    })

    expect(request).toHaveBeenLastCalledWith({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x7a69' }],
    })
  })

  it('adds an unknown chain with an explorer', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce('0x1')
      .mockRejectedValueOnce({ code: 4902 })
      .mockResolvedValueOnce(null)
    const provider = providerWith(request)

    await ensureChain(provider, {
      chainId: 31337,
      chainName: 'Anvil',
      rpcUrl: 'http://127.0.0.1:8545',
      explorerUrl: 'https://explorer.test',
    })

    expect(request).toHaveBeenLastCalledWith({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: '0x7a69',
          chainName: 'Anvil',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['http://127.0.0.1:8545'],
          blockExplorerUrls: ['https://explorer.test'],
        },
      ],
    })
  })

  it('adds an unknown chain without an explorer', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce('0x1')
      .mockRejectedValueOnce({ code: 4902 })
      .mockResolvedValueOnce(null)
    const provider = providerWith(request)

    await ensureChain(provider, {
      chainId: 31337,
      chainName: 'Anvil',
      rpcUrl: 'http://127.0.0.1:8545',
    })

    const params = request.mock.calls[2][0].params[0]
    expect(params).not.toHaveProperty('blockExplorerUrls')
  })

  it('rethrows other switch errors', async () => {
    const failure = new Error('user rejected')
    const request = vi
      .fn()
      .mockResolvedValueOnce('0x1')
      .mockRejectedValueOnce(failure)
    const provider = providerWith(request)

    await expect(
      ensureChain(provider, {
        chainId: 31337,
        chainName: 'Anvil',
        rpcUrl: 'http://127.0.0.1:8545',
      }),
    ).rejects.toBe(failure)
  })
})

describe('payments and errors', () => {
  it('sends a payment and returns a lowercase hash', async () => {
    const request = vi.fn().mockResolvedValue('0xABC')
    const provider = providerWith(request)

    await expect(
      sendPayment(provider, {
        from: '0xabc',
        to: '0xdef',
        valueWei: '2000000000000000',
      }),
    ).resolves.toBe('0xabc')

    expect(request).toHaveBeenCalledWith({
      method: 'eth_sendTransaction',
      params: [
        {
          from: '0xabc',
          to: '0xdef',
          value: '0x71afd498d0000',
        },
      ],
    })
  })

  it('maps MetaMask errors to friendly text', () => {
    expect(walletErrorMessage({ code: 4001 })).toBe(
      'Транзакцію скасовано в MetaMask.',
    )
    expect(walletErrorMessage({ code: -32002 })).toBe(
      'У MetaMask вже відкрито запит. Підтвердіть його у вікні розширення.',
    )
    expect(walletErrorMessage({ message: ' custom ' })).toBe('custom')
    expect(walletErrorMessage({ message: '   ' })).toBe('Невідома помилка')
    expect(walletErrorMessage(new Error('boom'))).toBe('boom')
    expect(walletErrorMessage('text')).toBe('Невідома помилка')
  })
})
