import type { ChangeEvent, RefObject } from 'react'

type Props = {
    file: File | null
    preview: string | null
    isAnalyzing: boolean
    inputRef: RefObject<HTMLInputElement | null>
    onFileChange: (event: ChangeEvent<HTMLInputElement>) => void
    onAnalyze: () => void
}

export default function UploadCard({
    file,
    preview,
    isAnalyzing,
    inputRef,
    onFileChange,
    onAnalyze,
}: Props) {
    return (
        <section className='card'>
            <h2>Аналіз фото</h2>
            <p className='hint'>JPG, JPEG або PNG, не більше 10 МБ.</p>

            <input
                ref={inputRef}
                type='file'
                accept='.jpg,.jpeg,.png'
                onChange={onFileChange}
            />

            {file && <p className='file-name'>Вибрано: {file.name}</p>}
            {preview && <img className='preview' src={preview} alt='Фото' />}

            <button
                type='button'
                className='primary'
                onClick={onAnalyze}
                disabled={!file || isAnalyzing}
            >
                {isAnalyzing ? 'Аналізуємо...' : 'Аналізувати'}
            </button>
        </section>
    )
}
