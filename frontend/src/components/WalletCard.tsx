import type { PaymentConfig, WalletInfo } from '../lib/api'
import { creditsLabel, shortAddress } from '../lib/wallet'

type Props = {
    config: PaymentConfig
    wallet: WalletInfo | null
    address: string | null
    isConnecting: boolean
    isPaying: boolean
    isChecking: boolean
    txHash: string
    onConnect: () => void
    onPay: () => void
    onCheck: () => void
    onTxHashChange: (value: string) => void
}

export default function WalletCard({
    config,
    wallet,
    address,
    isConnecting,
    isPaying,
    isChecking,
    txHash,
    onConnect,
    onPay,
    onCheck,
    onTxHashChange,
}: Props) {
    return (
        <section className='card'>
            <h2>Оплата аналізів</h2>
            <p className='hint'>
                {creditsLabel(config.credits)} за {config.price_eth} ETH. Мережа:{' '}
                {config.chain_name} (ID {config.chain_id}).
            </p>
            <p className='wallet-note'>
                Отримувач: <span className='wallet-address'>{config.receiver}</span>
            </p>

            {!address ? (
                <button
                    type='button'
                    className='primary'
                    onClick={onConnect}
                    disabled={isConnecting}
                >
                    {isConnecting ? 'Підключаємо...' : 'Підключити MetaMask'}
                </button>
            ) : (
                <div className='wallet'>
                    <div className='wallet-row'>
                        <span className='wallet-address'>{shortAddress(address)}</span>
                        <span className='wallet-credits'>
                            {wallet ? creditsLabel(wallet.credits) : 'Баланс невідомий'}
                        </span>
                    </div>

                    <div className='wallet-actions'>
                        <button
                            type='button'
                            className='primary'
                            onClick={onPay}
                            disabled={isPaying}
                        >
                            {isPaying
                                ? 'Очікуємо підтвердження...'
                                : `Купити ${creditsLabel(config.credits)}`}
                        </button>

                        <input
                            type='text'
                            value={txHash}
                            placeholder='Хеш транзакції 0x...'
                            onChange={(event) => onTxHashChange(event.target.value)}
                        />

                        <button
                            type='button'
                            onClick={onCheck}
                            disabled={isChecking}
                        >
                            {isChecking ? 'Перевіряємо...' : 'Перевірити оплату'}
                        </button>
                    </div>

                    <p className='wallet-note'>
                        Після оплати в MetaMask баланс оновиться автоматично. Хеш
                        транзакції можна вставити вручну, якщо підтвердження затримується.
                    </p>

                    {config.explorer_url && wallet?.last_transaction_hash && (
                        <a
                            href={`${config.explorer_url}/tx/${wallet.last_transaction_hash}`}
                            target='_blank'
                            rel='noreferrer'
                        >
                            Остання транзакція в оглядачі
                        </a>
                    )}
                </div>
            )}
        </section>
    )
}
