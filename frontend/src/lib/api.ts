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

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, init)

    if (!response.ok) {
        let message = `Помилка запиту (HTTP ${response.status})`

        try {
            const body = (await response.json()) as { detail?: unknown }

            if (typeof body.detail === 'string') {
                message = body.detail
            } else if (Array.isArray(body.detail)) {
                message = body.detail
                    .map((entry) => {
                        if (typeof entry === 'object' && entry !== null && 'msg' in entry) {
                            return String(entry.msg)
                        }

                        return String(entry)
                    })
                    .join('; ')
            }
        } catch {
            message = `Помилка запиту (HTTP ${response.status})`
        }

        throw new Error(message)
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

export function fetchAnalysis(id: number): Promise<Analysis> {
    return requestJson<Analysis>(`/api/analyses/${id}`)
}

export function analyzePhoto(file: File): Promise<Analysis> {
    const formData = new FormData()
    formData.append('file', file)

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
