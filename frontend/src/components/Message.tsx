type Props = {
    tone: 'error' | 'notice'
    text: string
    onClose: () => void
}

export default function Message({ tone, text, onClose }: Props) {
    return (
        <div className={`message ${tone}`}>
            <span>{text}</span>
            <button type='button' onClick={onClose}>
                Закрити
            </button>
        </div>
    )
}
