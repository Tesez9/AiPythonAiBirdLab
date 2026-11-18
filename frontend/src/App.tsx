import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import './App.css'
import AnalysisResult from './components/AnalysisResult'
import Header from './components/Header'
import HistoryList from './components/HistoryList'
import Message from './components/Message'
import StatsPanel from './components/StatsPanel'
import UploadCard from './components/UploadCard'
import WalletCard from './components/WalletCard'
import {
    ACCEPTED_EXTENSIONS,
    ApiError,
    MAX_FILE_SIZE,
    analyzePhoto,
    checkPayments,
    deleteAnalysis,
    errorMessage,
    exportCsv,
    fetchAnalyses,
    fetchAnalysis,
    fetchHealth,
    fetchPaymentConfig,
    fetchStats,
    fetchWallet,
    verifyPayment,
} from './lib/api'
import type {
    Analysis,
    Health,
    PaymentConfig,
    PaymentResult,
    Stats,
    WalletInfo,
} from './lib/api'
import {
    connectWallet,
    creditsLabel,
    ensureChain,
    getProvider,
    sendPayment,
    walletErrorMessage,
} from './lib/wallet'

const WALLET_STORAGE_KEY = 'aibirdlab.wallet'
const PAYMENT_POLL_ATTEMPTS = 40
const PAYMENT_POLL_DELAY = 3000

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
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
    const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null)
    const [wallet, setWallet] = useState<WalletInfo | null>(null)
    const [walletAddress, setWalletAddress] = useState<string | null>(null)
    const [txHash, setTxHash] = useState('')
    const [isConnecting, setIsConnecting] = useState(false)
    const [isPaying, setIsPaying] = useState(false)
    const [isChecking, setIsChecking] = useState(false)

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

    useEffect(() => {
        void loadPaymentConfig()
    }, [])

    useEffect(() => {
        if (!paymentConfig?.enabled) {
            return
        }

        const provider = getProvider()

        if (!provider?.on) {
            return
        }

        const handleAccountsChanged = (...args: unknown[]) => {
            const accounts = args[0]
            const nextAddress =
                Array.isArray(accounts) && accounts.length > 0
                    ? String(accounts[0]).toLowerCase()
                    : null

            setWalletAddress(nextAddress)
            setWallet(null)

            if (!nextAddress) {
                window.localStorage.removeItem(WALLET_STORAGE_KEY)
                return
            }

            window.localStorage.setItem(WALLET_STORAGE_KEY, nextAddress)
            void fetchWallet(nextAddress)
                .then(setWallet)
                .catch(() => setWallet(null))
        }

        provider.on('accountsChanged', handleAccountsChanged)

        return () => {
            provider.removeListener?.('accountsChanged', handleAccountsChanged)
        }
    }, [paymentConfig?.enabled])

    async function loadPaymentConfig() {
        try {
            const nextConfig = await fetchPaymentConfig()
            setPaymentConfig(nextConfig)

            if (!nextConfig.enabled) {
                return
            }

            const saved = window.localStorage.getItem(WALLET_STORAGE_KEY)

            if (!saved) {
                return
            }

            setWalletAddress(saved)

            try {
                setWallet(await fetchWallet(saved))
            } catch {
                setWallet(null)
            }
        } catch {
            setPaymentConfig(null)
        }
    }

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

    async function waitForPayment(
        address: string,
        hash: string,
    ): Promise<PaymentResult> {
        for (let attempt = 0; attempt < PAYMENT_POLL_ATTEMPTS; attempt += 1) {
            const result = await verifyPayment(address, hash)

            if (result.status !== 'pending') {
                return result
            }

            setNotice(
                `Очікуємо підтвердження: ${result.confirmations ?? 0}/${
                    result.required ?? 1
                }.`,
            )

            await wait(PAYMENT_POLL_DELAY)
        }

        throw new Error(
            'Транзакція ще не підтверджена. Перевірте оплату пізніше за хешем транзакції.',
        )
    }

    async function handleConnect() {
        setIsConnecting(true)
        setError(null)
        setNotice(null)

        try {
            const address = await connectWallet()

            window.localStorage.setItem(WALLET_STORAGE_KEY, address)
            setWalletAddress(address)
            setWallet(await fetchWallet(address))
            setNotice('MetaMask підключено.')
        } catch (walletError) {
            setError(walletErrorMessage(walletError))
        } finally {
            setIsConnecting(false)
        }
    }

    async function handlePay() {
        if (!walletAddress || !paymentConfig) {
            return
        }

        setIsPaying(true)
        setError(null)
        setNotice(null)

        try {
            const provider = getProvider()

            if (!provider) {
                throw new Error(
                    'MetaMask не знайдено. Встановіть розширення MetaMask у браузері.',
                )
            }

            await ensureChain(provider, {
                chainId: paymentConfig.chain_id,
                chainName: paymentConfig.chain_name,
                rpcUrl: paymentConfig.public_rpc_url,
                explorerUrl: paymentConfig.explorer_url || undefined,
            })

            const hash = await sendPayment(provider, {
                from: walletAddress,
                to: paymentConfig.receiver,
                valueWei: paymentConfig.price_wei,
            })

            setTxHash(hash)
            setNotice('Транзакцію надіслано. Очікуємо підтвердження в мережі...')

            const result = await waitForPayment(walletAddress, hash)

            setWallet(await fetchWallet(walletAddress))
            setNotice(`Оплату зараховано: ${creditsLabel(result.credits ?? 0)}.`)
        } catch (walletError) {
            setError(walletErrorMessage(walletError))
        } finally {
            setIsPaying(false)
        }
    }

    async function handleCheck() {
        if (!walletAddress) {
            return
        }

        setIsChecking(true)
        setError(null)
        setNotice(null)

        try {
            const hash = txHash.trim()
            const result = hash
                ? await verifyPayment(walletAddress, hash)
                : await checkPayments(walletAddress)

            if (result.status === 'pending') {
                setNotice(
                    `Транзакція ще не підтверджена: ${
                        result.confirmations ?? 0
                    }/${result.required ?? 1}.`,
                )
                return
            }

            setWallet(await fetchWallet(walletAddress))
            setNotice(`Оплату зараховано: ${creditsLabel(result.credits ?? 0)}.`)
        } catch (checkError) {
            if (checkError instanceof ApiError && checkError.status === 404) {
                setError(
                    'Нову оплату не знайдено. Переконайтеся, що транзакція підтверджена.',
                )
            } else {
                setError(errorMessage(checkError))
            }
        } finally {
            setIsChecking(false)
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

        if (paymentConfig?.enabled && !walletAddress) {
            setError('Підключіть MetaMask, щоб оплатити аналіз.')
            return
        }

        setIsAnalyzing(true)
        setError(null)
        setNotice(null)

        try {
            const analysis = await analyzePhoto(
                file,
                paymentConfig?.enabled ? walletAddress : null,
            )
            const creditsLeft = analysis.credits_left

            setActive(analysis)
            setFile(null)
            setPreviewFile(null)

            if (typeof creditsLeft === 'number' && walletAddress) {
                setWallet((current) =>
                    current
                        ? { ...current, credits: creditsLeft }
                        : {
                              wallet_address: walletAddress,
                              credits: creditsLeft,
                              price_wei: paymentConfig?.price_wei ?? '',
                              package_credits: paymentConfig?.credits ?? 0,
                              last_transaction_hash: null,
                          },
                )
            }

            setNotice(`Розпізнано: ${analysis.predicted_species}.`)

            if (fileInputRef.current) {
                fileInputRef.current.value = ''
            }

            await refreshData(appliedQuery)
        } catch (requestError) {
            if (requestError instanceof ApiError && requestError.status === 402) {
                setError(
                    'Оплачені аналізи закінчилися. Придбайте новий пакет через MetaMask.',
                )
            } else {
                setError(errorMessage(requestError))
            }
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
                {paymentConfig?.enabled && (
                    <WalletCard
                        config={paymentConfig}
                        wallet={wallet}
                        address={walletAddress}
                        isConnecting={isConnecting}
                        isPaying={isPaying}
                        isChecking={isChecking}
                        txHash={txHash}
                        onConnect={() => void handleConnect()}
                        onPay={() => void handlePay()}
                        onCheck={() => void handleCheck()}
                        onTxHashChange={setTxHash}
                    />
                )}

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
