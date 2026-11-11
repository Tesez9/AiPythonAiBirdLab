import type { Health } from '../lib/api'

type Props = {
    health: Health | null
}

export default function Header({ health }: Props) {
    const label = !health
        ? 'Сервер не підключено'
        : health.status === 'ok'
            ? 'Сервер працює'
            : 'AI недоступний'

    return (
        <header className='header'>
            <div>
                <h1>AI Bird Lab</h1>
                <p>Класифікація птахів за фото</p>
            </div>
            <span className={`health ${health?.status === 'ok' ? 'ok' : 'bad'}`}>{label}</span>
        </header>
    )
}
