import Constants from 'expo-constants'
import { File, Paths } from 'expo-file-system'
import { fetch } from 'expo/fetch'
import type { ImagePickerAsset } from 'expo-image-picker'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

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

function expoHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri

  if (!hostUri) {
    return null
  }

  return hostUri.split(':')[0] || null
}

function resolveApiBase(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim()

  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  const host = expoHost()

  if (host) {
    return `http://${host}:8000`
  }

  return 'http://127.0.0.1:8000'
}

export const API_BASE = resolveApiBase()
export const CSV_URL = `${API_BASE}/api/export.csv`

function errorFromBody(body: { detail?: unknown }, status: number): string {
  if (typeof body.detail === 'string') {
    return body.detail
  }

  if (Array.isArray(body.detail)) {
    return body.detail
      .map((entry) => {
        if (
          typeof entry === 'object' &&
          entry !== null &&
          'msg' in entry
        ) {
          return String(entry.msg)
        }

        return String(entry)
      })
      .join('; ')
  }

  if (
    typeof body.detail === 'object' &&
    body.detail !== null &&
    'message' in body.detail
  ) {
    return String(body.detail.message)
  }

  return `Помилка запиту (HTTP ${status})`
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

export async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)

  if (!response.ok) {
    let detail: unknown = null
    let message = `Помилка запиту (HTTP ${response.status})`

    try {
      const body = (await response.json()) as { detail?: unknown }
      detail = body.detail ?? null
      message = errorFromBody(body, response.status)
    } catch {
      // The server did not return JSON; keep the status-based message.
    }

    throw new ApiError(response.status, message, detail)
  }

  return (await response.json()) as T
}

export async function fetchHealth(): Promise<Health> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)

  try {
    return await requestJson<Health>('/health', {
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
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
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
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

export async function listAnalyses(query = ''): Promise<AnalysisPage> {
  const params = new URLSearchParams({ limit: '200' })
  const normalized = query.trim()

  if (normalized) {
    params.set('query', normalized)
  }

  return requestJson<AnalysisPage>(`/api/analyses?${params.toString()}`)
}

export function getAnalysis(id: number): Promise<Analysis> {
  return requestJson<Analysis>(`/api/analyses/${id}`)
}

export function deleteAnalysis(id: number): Promise<{ deleted: number }> {
  return requestJson<{ deleted: number }>(`/api/analyses/${id}`, {
    method: 'DELETE',
  })
}

export function getStats(): Promise<Stats> {
  return requestJson<Stats>('/api/stats')
}

function extensionForMime(mimeType?: string): string {
  return mimeType === 'image/png' ? '.png' : '.jpg'
}

export async function analyzeImage(
  asset: ImagePickerAsset,
  walletAddress?: string | null,
): Promise<Analysis> {
  const file = new File(asset.uri)
  const mimeType = asset.mimeType || file.type || 'image/jpeg'
  const fallbackName = `photo_${Date.now()}${extensionForMime(mimeType)}`
  const candidateName = asset.fileName?.trim() || file.name || fallbackName
  const uploadName = /\.[a-z0-9]+$/i.test(candidateName)
    ? candidateName
    : `${candidateName}${extensionForMime(mimeType)}`
  const formData = new FormData()

  formData.append('file', file, uploadName)

  if (walletAddress) {
    formData.append('wallet_address', walletAddress)
  }

  return requestJson<Analysis>('/api/analyses', {
    method: 'POST',
    body: formData,
    headers: {
      Accept: 'application/json',
    },
  })
}

export function validateImageAsset(asset: ImagePickerAsset): string | null {
  const name = (asset.fileName || asset.uri.split('?')[0] || '').toLowerCase()
  const extension = name.includes('.')
    ? name.slice(name.lastIndexOf('.'))
    : ''
  const mimeType = asset.mimeType?.toLowerCase()

  if (
    !['.jpg', '.jpeg', '.png'].includes(extension) &&
    !['image/jpeg', 'image/png'].includes(mimeType || '')
  ) {
    return 'Підтримуються лише JPG, JPEG і PNG.'
  }

  if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
    return 'Файл завеликий. Максимум — 10 МБ.'
  }

  return null
}

export function assetUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null
  }

  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`
}

export function assetName(asset: ImagePickerAsset): string {
  return asset.fileName || asset.uri.split('/').pop()?.split('?')[0] || 'Фото'
}

export async function downloadCsv(): Promise<File> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const destination = new File(Paths.cache, `bird_analysis_${stamp}.csv`)

  return File.downloadFileAsync(CSV_URL, destination)
}
