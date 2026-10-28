import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'

const API_BASE = (
  import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png']

type Prediction = {
  species: string
  confidence: number
}

type BirdInfo = {
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

type Analysis = {
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

type AnalysisPage = {
  total: number
  items: Analysis[]
}

type SpeciesCount = {
  species: string
  count: number
}

type Stats = {
  total: number
  unique_species: number
  average_confidence: number
  highest: Analysis | null
  lowest: Analysis | null
  top_species: SpeciesCount[]
}

type Health = {
  status: string
  database: string
  ai_server: string
  ai_url: string
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    } catch {
      message = `Помилка запиту (HTTP ${response.status})`
    }

    throw new Error(message)
  }

  return (await response.json()) as T
}

function assetUrl(path: string | null | undefined): string | null {
  if (!path) {
    return null
  }

  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('uk-UA', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function errorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return 'Не вдалося з’єднатися з сервером. Перевірте, чи він запущений.'
  }

  return error instanceof Error ? error.message : 'Невідома помилка'
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [active, setActive] = useState<Analysis | null>(null)
  const [items, setItems] = useState<Analysis[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  useEffect(() => {
    void refreshData('')
    void refreshHealth()

    const timer = window.setInterval(() => {
      void refreshHealth()
    }, 10000)

    return () => {
      window.clearInterval(timer)

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  async function refreshHealth() {
    try {
      setHealth(await requestJson<Health>('/health'))
    } catch {
      setHealth(null)
    }
  }

  async function refreshData(search: string) {
    setError(null)
    setIsLoadingList(true)
    setIsLoadingStats(true)

    const params = new URLSearchParams({ limit: '200' })
    const normalized = search.trim()

    if (normalized) {
      params.set('query', normalized)
    }

    try {
      const [page, nextStats] = await Promise.all([
        requestJson<AnalysisPage>(`/api/analyses?${params.toString()}`),
        requestJson<Stats>('/api/stats'),
      ])

      setItems(page.items)
      setTotal(page.total)
      setStats(nextStats)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoadingList(false)
      setIsLoadingStats(false)
    }
  }

  function setPreviewFile(nextFile: File | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }

    if (!nextFile) {
      setPreview(null)
      return
    }

    const url = URL.createObjectURL(nextFile)
    previewUrlRef.current = url
    setPreview(url)
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null

    setError(null)
    setNotice(null)

    if (!nextFile) {
      setFile(null)
      setPreviewFile(null)
      return
    }

    const dotIndex = nextFile.name.lastIndexOf('.')
    const extension =
      dotIndex >= 0 ? nextFile.name.slice(dotIndex).toLowerCase() : ''

    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError('Підтримуються лише JPG, JPEG і PNG.')
      event.target.value = ''
      setFile(null)
      setPreviewFile(null)
      return
    }

    if (nextFile.size > MAX_FILE_SIZE) {
      setError('Файл завеликий. Максимум — 10 МБ.')
      event.target.value = ''
      setFile(null)
      setPreviewFile(null)
      return
    }

    setFile(nextFile)
    setPreviewFile(nextFile)
  }

  async function handleAnalyze() {
    if (!file) {
      setError('Спочатку виберіть фото птаха.')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setNotice(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const analysis = await requestJson<Analysis>('/api/analyses', {
        method: 'POST',
        body: formData,
      })

      setActive(analysis)
      setFile(null)
      setPreviewFile(null)
      setNotice(`Розпізнано: ${analysis.predicted_species}.`)

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

      await refreshData(appliedQuery)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextQuery = query.trim()

    setAppliedQuery(nextQuery)
    setNotice(null)
    await refreshData(nextQuery)
  }

  async function clearSearch() {
    setQuery('')
    setAppliedQuery('')
    await refreshData('')
  }

  async function handleSelect(id: number) {
    setIsLoadingDetail(true)
    setError(null)

    try {
      setActive(await requestJson<Analysis>(`/api/analyses/${id}`))
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsLoadingDetail(false)
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Видалити цей запис з історії?')) {
      return
    }

    setError(null)
    setNotice(null)

    try {
      await requestJson<{ message: string }>(`/api/analyses/${id}`, {
        method: 'DELETE',
      })

      if (active?.id === id) {
        setActive(null)
      }

      setNotice('Запис видалено.')
      await refreshData(appliedQuery)
    } catch (requestError) {
      setError(errorMessage(requestError))
    }
  }

  async function handleExport() {
    setIsExporting(true)
    setError(null)
    setNotice(null)

    try {
      const response = await fetch(`${API_BASE}/api/export.csv`)

      if (!response.ok) {
        throw new Error(`Не вдалося експортувати CSV (HTTP ${response.status}).`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.download = 'bird_analysis.csv'
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      setNotice(`Експортовано ${total} записів.`)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setIsExporting(false)
    }
  }

  const healthLabel = !health
    ? 'Сервер не підключено'
    : health.status === 'ok'
      ? 'Сервер працює'
      : 'AI недоступний'

  const activeImage = assetUrl(active?.image_url)
  const activeInfo = active?.info ?? null
  const topPredictions = active?.top3 ?? []

  const infoRows: Array<[string, string | null]> = activeInfo
    ? [
        ['Українська назва', activeInfo.ukrainian],
        ['Наукова назва', activeInfo.scientific],
        ['Родина', activeInfo.family],
        ['Середовище', activeInfo.habitat],
        ['Поширення', activeInfo.range],
        ['Живлення', activeInfo.diet],
        ['Розміри', activeInfo.size],
        ['Статус', activeInfo.status],
        ['Факт', activeInfo.facts],
      ]
    : []

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>AI Bird Lab</h1>
          <p>Класифікація птахів за фото</p>
        </div>
        <span className={`health ${health?.status === 'ok' ? 'ok' : 'bad'}`}>
          {healthLabel}
        </span>
      </header>

      {error && (
        <div className="message error">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Закрити
          </button>
        </div>
      )}

      {notice && (
        <div className="message notice">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Закрити
          </button>
        </div>
      )}

      <main>
        <section className="card">
          <h2>Аналіз фото</h2>
          <p className="hint">JPG, JPEG або PNG, не більше 10 МБ.</p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png"
            onChange={handleFileChange}
          />

          {file && <p className="file-name">Вибрано: {file.name}</p>}
          {preview && <img className="preview" src={preview} alt="Фото" />}

          <button
            type="button"
            className="primary"
            onClick={() => void handleAnalyze()}
            disabled={!file || isAnalyzing}
          >
            {isAnalyzing ? 'Аналізуємо...' : 'Аналізувати'}
          </button>
        </section>

        <section className="card">
          <h2>Результат</h2>

          {isLoadingDetail ? (
            <p>Завантаження...</p>
          ) : active ? (
            <div>
              {activeImage && (
                <img className="result-image" src={activeImage} alt={active.predicted_species} />
              )}

              <h3>{active.predicted_species}</h3>
              <p>
                Впевненість: <strong>{percent(active.confidence)}</strong>
              </p>

              {active.low_confidence && (
                <p className="warning">
                  Низька впевненість: результат може бути неточним.
                </p>
              )}

              <p>{active.description || 'Опис відсутній.'}</p>

              {active.source && (
                <p>
                  <a href={active.source} target="_blank" rel="noreferrer">
                    Джерело
                  </a>
                </p>
              )}

              {topPredictions.length > 0 && (
                <>
                  <h4>TOP-3</h4>
                  <ol className="top-list">
                    {topPredictions.map((prediction) => (
                      <li key={prediction.species}>
                        {prediction.species} — {percent(prediction.confidence)}
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {activeInfo && (
                <>
                  <h4>Про вид</h4>
                  <table className="info-table">
                    <tbody>
                      {infoRows.map(([label, value]) => (
                        <tr key={label}>
                          <th>{label}</th>
                          <td>{value?.trim() || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ) : (
            <p>Виберіть фото або запис з історії.</p>
          )}
        </section>

        <section className="card">
          <h2>Історія</h2>

          <form className="search" onSubmit={(event) => void handleSearch(event)}>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Вид або назва файлу"
            />
            <button type="submit">Знайти</button>
            {(query || appliedQuery) && (
              <button type="button" onClick={() => void clearSearch()}>
                Скинути
              </button>
            )}
          </form>

          <p className="hint">
            Знайдено: {total}
            {appliedQuery ? ` · запит: ${appliedQuery}` : ''}
            <button
              type="button"
              className="link-button"
              onClick={() => void refreshData(appliedQuery)}
              disabled={isLoadingList}
            >
              Оновити
            </button>
          </p>

          {isLoadingList ? (
            <p>Завантаження...</p>
          ) : items.length === 0 ? (
            <p>Записів не знайдено.</p>
          ) : (
            <div className="history">
              {items.map((item) => {
                const thumbnail = assetUrl(item.image_url)

                return (
                  <div
                    className={`history-item ${active?.id === item.id ? 'selected' : ''}`}
                    key={item.id}
                  >
                    {thumbnail ? (
                      <img className="thumb" src={thumbnail} alt="" />
                    ) : (
                      <div className="thumb empty">
                        {item.image_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className="history-text">
                      <strong>{item.predicted_species}</strong>
                      <span>
                        {item.image_name} · {formatDate(item.analysis_date)}
                      </span>
                    </div>

                    <span className="score">{percent(item.confidence)}</span>

                    <button
                      type="button"
                      onClick={() => void handleSelect(item.id)}
                    >
                      Деталі
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void handleDelete(item.id)}
                    >
                      Видалити
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="card">
          <h2>Статистика</h2>

          {isLoadingStats ? (
            <p>Завантаження...</p>
          ) : stats ? (
            <div>
              <ul className="stats-list">
                <li>Всього аналізів: {stats.total}</li>
                <li>Унікальних видів: {stats.unique_species}</li>
                <li>Середня впевненість: {percent(stats.average_confidence)}</li>
                <li>
                  Найвища: {stats.highest
                    ? `${stats.highest.predicted_species} — ${percent(stats.highest.confidence)}`
                    : '—'}
                </li>
                <li>
                  Найнижча: {stats.lowest
                    ? `${stats.lowest.predicted_species} — ${percent(stats.lowest.confidence)}`
                    : '—'}
                </li>
              </ul>

              <h4>Найчастіші види</h4>
              {stats.top_species.length > 0 ? (
                <ol className="top-list">
                  {stats.top_species.map((entry) => (
                    <li key={entry.species}>
                      {entry.species} — {entry.count}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>Даних ще немає.</p>
              )}

              <button
                type="button"
                onClick={() => void handleExport()}
                disabled={isExporting || total === 0}
              >
                {isExporting ? 'Експортуємо...' : 'Експорт CSV'}
              </button>
            </div>
          ) : (
            <p>Статистика недоступна.</p>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
