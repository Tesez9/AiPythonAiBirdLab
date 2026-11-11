import type { Analysis } from '../lib/api'
import { assetUrl, percent } from '../lib/api'

type Props = {
    analysis: Analysis | null
    isLoading: boolean
}

export default function AnalysisResult({ analysis, isLoading }: Props) {
    const image = assetUrl(analysis?.image_url)
    const info = analysis?.info ?? null
    const topPredictions = analysis?.top3 ?? []

    const infoRows: Array<[string, string | null]> = info
        ? [
            ['Українська назва', info.ukrainian],
            ['Наукова назва', info.scientific],
            ['Родина', info.family],
            ['Середовище', info.habitat],
            ['Поширення', info.range],
            ['Живлення', info.diet],
            ['Розміри', info.size],
            ['Статус', info.status],
            ['Факт', info.facts],
        ]
        : []

    return (
        <section className='card'>
            <h2>Результат</h2>

            {isLoading ? (
                <p>Завантаження...</p>
            ) : analysis ? (
                <div>
                    {image && <img className='result-image' src={image} alt={analysis.predicted_species} />}

                    <h3>{analysis.predicted_species}</h3>
                    <p>Впевненість: <strong>{percent(analysis.confidence)}</strong></p>

                    {analysis.low_confidence && (
                        <p className='warning'>Низька впевненість: результат може бути неточним.</p>
                    )}

                    <p>{analysis.description || 'Опис відсутній.'}</p>

                    {analysis.source && (
                        <p><a href={analysis.source} target='_blank' rel='noreferrer'>Джерело</a></p>
                    )}

                    {topPredictions.length > 0 && (
                        <>
                            <h4>TOP-3</h4>
                            <ol className='top-list'>
                                {topPredictions.map((prediction) => (
                                    <li key={prediction.species}>
                                        {prediction.species} — {percent(prediction.confidence)}
                                    </li>
                                ))}
                            </ol>
                        </>
                    )}

                    {info && (
                        <>
                            <h4>Про вид</h4>
                            <table className='info-table'>
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
    )
}
