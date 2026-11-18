export const API_BASE = (
    import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

export const MAX_FILE_SIZE = 10 * 1024 * 1024
export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png']

export type Prediction = {
    species: string
    confidence: number
}

export type BirdInfo = {
    species: string
    ukrainian: string | null
    scientific: string | null
    family: string | null
    habitat: string | null
    range: string | null
    diet: string | null
    size: string | null
    facts: string | null
    status: string | null
    description: string | null
    source: string | null
}

export type Analysis = {
    id: number
    image_name: string
    image_url: string | null
    predicted_species: string
    confidence: number
    low_confidence: boolean
    analysis_date: string
    description: string | null
    source: string | null
    top3?: Prediction[]
    info?: BirdInfo | null
    credits_left?: number
}

export type AnalysisPage = {
    total: number
    items: Analysis[]
}

export type SpeciesCount = {
    species: string
    count: number
}

export type Stats = {
    total: number
    unique_species: number
    average_confidence: number
    highest: Analysis | null
    lowest: Analysis | null
    top_species: SpeciesCount[]
}

export type Health = {
    status: string
    database: string
    ai_server: string
    ai_url: string
}

export type PaymentConfig = {
    enabled: boolean
    chain_id: number
    chain_name: string
    receiver: string
    price_wei: string
    price_eth: string
    credits: number
    confirmations: number
    explorer_url: string
    public_rpc_url: string
}

export type WalletInfo = {
    wallet_address: string
    credits: number
    price_wei: string
    package_credits: number
    last_transaction_hash: string | null
}

export type PaymentResult = {
    status: 'credited' | 'already_processed' | 'pending'
    credits?: number
    transaction_hash: string
    amount_wei?: string
    block_number?: number
    confirmations?: number
    required?: number
    message?: string
    transactions?: string[]
}

export function assetUrl(path: string | null | undefined): string | null {
    if (!path) {
        return null
    }

    return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`
}

export function percent(value: number): string {
    return `${(value * 100).toFixed(1)}%`
}

export function formatDate(value: string): string {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return value
    }

    return date.toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
}

export function errorMessage(error: unknown): string {
    if (error instanceof TypeError) {
        return 'Не вдалося з’єднатися з сервером. Перевірте, чи він запущений.'
    }

    return error instanceof Error ? error.message : 'Невідома помилка'
}

export class ApiError extends Error {
    status: number
    detail: unknown

    constructor(status: number, message: string, detail?: unknown) {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.detail = detail
    }
}

function detailMessage(detail: unknown, status: number): string {
    if (typeof detail === 'string') {
        return detail
    }

    if (Array.isArray(detail)) {
        return detail
            .map((entry) => {
                if (typeof entry === 'object' && entry !== null && 'msg' in entry) {
                    return String(entry.msg)
                }

                return String(entry)
            })
            .join('; ')
    }

    if (typeof detail === 'object' && detail !== null && 'message' in detail) {
        return String(detail.message)
    }

    return `Помилка запиту (HTTP ${status})`
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, init)

    if (!response.ok) {
        let detail: unknown = null

        try {
            const body = (await response.json()) as { detail?: unknown }
            detail = body.detail ?? null
        } catch {
            detail = null
        }

        throw new ApiError(response.status, detailMessage(detail, response.status), detail)
    }

    return (await response.json()) as T
}

export function fetchAnalyses(search: string): Promise<AnalysisPage> {
    const params = new URLSearchParams({ limit: '200' })
    const normalized = search.trim()

    if (normalized) {
        params.set('query', normalized)
    }

    return requestJson<AnalysisPage>(`/api/analyses?${params.toString()}`)
}

export function fetchStats(): Promise<Stats> {
    return requestJson<Stats>('/api/stats')
}

export function fetchHealth(): Promise<Health> {
    return requestJson<Health>('/health')
}

export function fetchPaymentConfig(): Promise<PaymentConfig> {
    return requestJson<PaymentConfig>('/api/payments/config')
}

export function fetchWallet(address: string): Promise<WalletInfo> {
    return requestJson<WalletInfo>(`/api/wallet/${address}`)
}

export function verifyPayment(
    walletAddress: string,
    transactionHash: string,
): Promise<PaymentResult> {
    return requestJson<PaymentResult>('/api/payments/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            wallet_address: walletAddress,
            transaction_hash: transactionHash,
        }),
    })
}

export function checkPayments(address: string): Promise<PaymentResult> {
    return requestJson<PaymentResult>(`/api/payments/check/${address}`, {
        method: 'POST',
    })
}

export function fetchAnalysis(id: number): Promise<Analysis> {
    return requestJson<Analysis>(`/api/analyses/${id}`)
}

export function analyzePhoto(file: File, walletAddress?: string | null): Promise<Analysis> {
    const formData = new FormData()
    formData.append('file', file)

    if (walletAddress) {
        formData.append('wallet_address', walletAddress)
    }

    return requestJson<Analysis>('/api/analyses', { method: 'POST', body: formData })
}

export function deleteAnalysis(id: number): Promise<{ deleted: number }> {
    return requestJson<{ deleted: number }>(`/api/analyses/${id}`, { method: 'DELETE' })
}

export async function exportCsv(): Promise<Blob> {
    const response = await fetch(`${API_BASE}/api/export.csv`)

    if (!response.ok) {
        throw new Error(`Не вдалося експортувати CSV (HTTP ${response.status}).`)
    }

    return response.blob()
}
