import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'
import AnalysisResult from './components/AnalysisResult'
import Header from './components/Header'
import HistoryList from './components/HistoryList'
import Message from './components/Message'
import StatsPanel from './components/StatsPanel'
import UploadCard from './components/UploadCard'
import {
    ACCEPTED_EXTENSIONS,
    MAX_FILE_SIZE,
    analyzePhoto,
    deleteAnalysis,
    errorMessage,
    exportCsv,
    fetchAnalyses,
    fetchAnalysis,
    fetchHealth,
    fetchStats,
} from './lib/api'
import type { Analysis, Health, Stats } from './lib/api'

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
            setHealth(await fetchHealth())
        } catch {
            setHealth(null)
        }
    }

    async function refreshData(search: string) {
        setError(null)
        setIsLoadingList(true)
        setIsLoadingStats(true)

        try {
            const [page, nextStats] = await Promise.all([fetchAnalyses(search), fetchStats()])

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
        const extension = dotIndex >= 0 ? nextFile.name.slice(dotIndex).toLowerCase() : ''

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
            const analysis = await analyzePhoto(file)

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
            setActive(await fetchAnalysis(id))
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
            await deleteAnalysis(id)

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
            const blob = await exportCsv()
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

    return (
        <div className='page'>
            <Header health={health} />

            {error && <Message tone='error' text={error} onClose={() => setError(null)} />}
            {notice && <Message tone='notice' text={notice} onClose={() => setNotice(null)} />}

            <main>
                <UploadCard
                    file={file}
                    preview={preview}
                    isAnalyzing={isAnalyzing}
                    inputRef={fileInputRef}
                    onFileChange={handleFileChange}
                    onAnalyze={() => void handleAnalyze()}
                />

                <AnalysisResult analysis={active} isLoading={isLoadingDetail} />

                <HistoryList
                    items={items}
                    total={total}
                    activeId={active?.id ?? null}
                    query={query}
                    appliedQuery={appliedQuery}
                    isLoading={isLoadingList}
                    onQueryChange={setQuery}
                    onSearch={(event) => void handleSearch(event)}
                    onClear={() => void clearSearch()}
                    onRefresh={() => void refreshData(appliedQuery)}
                    onSelect={(id) => void handleSelect(id)}
                    onDelete={(id) => void handleDelete(id)}
                />

                <StatsPanel
                    stats={stats}
                    isLoading={isLoadingStats}
                    isExporting={isExporting}
                    total={total}
                    onExport={() => void handleExport()}
                />
            </main>
        </div>
    )
}

export default App
