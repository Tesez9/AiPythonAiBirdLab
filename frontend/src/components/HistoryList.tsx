import type { FormEvent } from 'react'
import type { Analysis } from '../lib/api'
import { assetUrl, formatDate, percent } from '../lib/api'

type Props = {
    items: Analysis[]
    total: number
    activeId: number | null
    query: string
    appliedQuery: string
    isLoading: boolean
    onQueryChange: (value: string) => void
    onSearch: (event: FormEvent<HTMLFormElement>) => void
    onClear: () => void
    onRefresh: () => void
    onSelect: (id: number) => void
    onDelete: (id: number) => void
}

export default function HistoryList({
    items,
    total,
    activeId,
    query,
    appliedQuery,
    isLoading,
    onQueryChange,
    onSearch,
    onClear,
    onRefresh,
    onSelect,
    onDelete,
}: Props) {
    return (
        <section className='card'>
            <h2>Історія</h2>

            <form className='search' onSubmit={onSearch}>
                <input
                    type='search'
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder='Вид або назва файлу'
                />
                <button type='submit'>Знайти</button>
                {(query || appliedQuery) && <button type='button' onClick={onClear}>Скинути</button>}
            </form>

            <p className='hint'>
                Знайдено: {total}
                {appliedQuery ? ` · запит: ${appliedQuery}` : ''}
                <button type='button' className='link-button' onClick={onRefresh} disabled={isLoading}>
                    Оновити
                </button>
            </p>

            {isLoading ? (
                <p>Завантаження...</p>
            ) : items.length === 0 ? (
                <p>Записів не знайдено.</p>
            ) : (
                <div className='history'>
                    {items.map((item) => {
                        const thumbnail = assetUrl(item.image_url)

                        return (
                            <div className={`history-item ${activeId === item.id ? 'selected' : ''}`} key={item.id}>
                                {thumbnail ? (
                                    <img className='thumb' src={thumbnail} alt='' />
                                ) : (
                                    <div className='thumb empty'>{item.image_name.slice(0, 2).toUpperCase()}</div>
                                )}

                                <div className='history-text'>
                                    <strong>{item.predicted_species}</strong>
                                    <span>{item.image_name} · {formatDate(item.analysis_date)}</span>
                                </div>

                                <span className='score'>{percent(item.confidence)}</span>
                                <button type='button' onClick={() => onSelect(item.id)}>Деталі</button>
                                <button type='button' className='danger' onClick={() => onDelete(item.id)}>Видалити</button>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
