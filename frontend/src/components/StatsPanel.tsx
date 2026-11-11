import type { Stats } from '../lib/api'
import { percent } from '../lib/api'

type Props = {
    stats: Stats | null
    isLoading: boolean
    isExporting: boolean
    total: number
    onExport: () => void
}

export default function StatsPanel({
    stats,
    isLoading,
    isExporting,
    total,
    onExport,
}: Props) {
    const highestLabel = stats?.highest
        ? `${stats.highest.predicted_species} — ${percent(stats.highest.confidence)}`
        : '—'

    const lowestLabel = stats?.lowest
        ? `${stats.lowest.predicted_species} — ${percent(stats.lowest.confidence)}`
        : '—'

    return (
        <section className='card'>
            <h2>Статистика</h2>

            {isLoading ? (
                <p>Завантаження...</p>
            ) : stats ? (
                <div>
                    <ul className='stats-list'>
                        <li>Всього аналізів: {stats.total}</li>
                        <li>Унікальних видів: {stats.unique_species}</li>
                        <li>Середня впевненість: {percent(stats.average_confidence)}</li>
                        <li>Найвища: {highestLabel}</li>
                        <li>Найнижча: {lowestLabel}</li>
                    </ul>

                    <h4>Найчастіші види</h4>
                    {stats.top_species.length > 0 ? (
                        <ol className='top-list'>
                            {stats.top_species.map((entry) => (
                                <li key={entry.species}>{entry.species} — {entry.count}</li>
                            ))}
                        </ol>
                    ) : (
                        <p>Даних ще немає.</p>
                    )}

                    <button type='button' onClick={onExport} disabled={isExporting || total === 0}>
                        {isExporting ? 'Експортуємо...' : 'Експорт CSV'}
                    </button>
                </div>
            ) : (
                <p>Статистика недоступна.</p>
            )}
        </section>
    )
}
