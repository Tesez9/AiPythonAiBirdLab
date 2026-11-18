export type EthereumProvider = {
    request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>
    on?: (event: string, handler: (...args: unknown[]) => void) => void
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void
}

export type ChainConfig = {
    chainId: number
    chainName: string
    rpcUrl: string
    explorerUrl?: string
}

declare global {
    interface Window {
        ethereum?: EthereumProvider
    }
}

export function getProvider(): EthereumProvider | null {
    return typeof window !== 'undefined' && window.ethereum ? window.ethereum : null
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

export async function connectWallet(): Promise<string> {
    const provider = getProvider()

    if (!provider) {
        throw new Error('MetaMask не знайдено. Встановіть розширення MetaMask у браузері.')
    }

    const accounts = await provider.request({ method: 'eth_requestAccounts' })

    if (!Array.isArray(accounts) || accounts.length === 0) {
        throw new Error('MetaMask не повернув жодного акаунта.')
    }

    return String(accounts[0]).toLowerCase()
}

export async function getChainId(provider: EthereumProvider): Promise<number> {
    const value = await provider.request({ method: 'eth_chainId' })
    return Number.parseInt(String(value), 16)
}

function isUnknownChain(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 4902
    )
}

export async function ensureChain(
    provider: EthereumProvider,
    config: ChainConfig,
): Promise<void> {
    if ((await getChainId(provider)) === config.chainId) {
        return
    }

    const chainId = `0x${config.chainId.toString(16)}`

    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId }],
        })
    } catch (error) {
        if (!isUnknownChain(error)) {
            throw error
        }

        const params: Record<string, unknown> = {
            chainId,
            chainName: config.chainName,
            nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
            },
            rpcUrls: [config.rpcUrl],
        }

        if (config.explorerUrl) {
            params.blockExplorerUrls = [config.explorerUrl]
        }

        await provider.request({
            method: 'wallet_addEthereumChain',
            params: [params],
        })
    }
}

export async function sendPayment(
    provider: EthereumProvider,
    options: { from: string; to: string; valueWei: string },
): Promise<string> {
    const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [
            {
                from: options.from,
                to: options.to,
                value: `0x${BigInt(options.valueWei).toString(16)}`,
            },
        ],
    })

    return String(hash).toLowerCase()
}

export function walletErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = (error as { code?: unknown }).code

        if (code === 4001) {
            return 'Транзакцію скасовано в MetaMask.'
        }

        if (code === -32002) {
            return 'У MetaMask вже відкрито запит. Підтвердіть його у вікні розширення.'
        }
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
        const message = String((error as { message?: unknown }).message).trim()

        if (message) {
            return message
        }
    }

    return error instanceof Error ? error.message : 'Невідома помилка'
}
