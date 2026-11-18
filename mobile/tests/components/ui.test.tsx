import { fireEvent, render, screen } from '@testing-library/react-native'

import {
  AppButton,
  Banner,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingBlock,
  Pill,
  ScreenHeader,
  SectionTitle,
  StatTile,
} from '@/components/ui'

describe('AppButton', () => {
  it('renders a label and handles presses', async () => {
    const onPress = jest.fn()

    await render(<AppButton label="Натиснути" onPress={onPress} />)
    await fireEvent.press(screen.getByRole('button'))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders icon, compact and danger variants', async () => {
    await render(
      <AppButton
        compact
        icon="bird"
        label="Небезпечно"
        onPress={jest.fn()}
        variant="danger"
      />,
    )

    expect(screen.getByText('bird')).toBeOnTheScreen()
    expect(screen.getByText('Небезпечно')).toBeOnTheScreen()
  })

  it('does not press when disabled', async () => {
    const onPress = jest.fn()

    await render(<AppButton disabled label="Disabled" onPress={onPress} />)

    const button = screen.getByRole('button')

    expect(button).toBeDisabled()
    await fireEvent.press(button)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('shows a spinner and busy state while loading', async () => {
    await render(<AppButton label="Loading" loading onPress={jest.fn()} />)

    expect(
      screen.container.queryAll((node) => node.type === 'ActivityIndicator')
        .length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('layout primitives', () => {
  it('renders Card children', async () => {
    await render(
      <Card>
        <StatTile label="Всього" value="12" />
      </Card>,
    )

    expect(screen.getByText('12')).toBeOnTheScreen()
    expect(screen.getByText('Всього')).toBeOnTheScreen()
  })

  it('renders ScreenHeader with subtitle and right slot', async () => {
    await render(
      <ScreenHeader
        right={<Pill label="Онлайн" tone="success" />}
        subtitle="Підзаголовок"
        title="Заголовок"
      />,
    )

    expect(screen.getByText('Заголовок')).toBeOnTheScreen()
    expect(screen.getByText('Підзаголовок')).toBeOnTheScreen()
    expect(screen.getByText('Онлайн')).toBeOnTheScreen()
  })

  it('renders ScreenHeader without optional slots', async () => {
    await render(<ScreenHeader title="Тільки заголовок" />)

    expect(screen.getByText('Тільки заголовок')).toBeOnTheScreen()
  })

  it('renders SectionTitle variants', async () => {
    const { rerender } = await render(
      <SectionTitle
        right={<Pill label="3" />}
        subtitle="Опис"
        title="Секція"
      />,
    )

    expect(screen.getByText('Секція')).toBeOnTheScreen()
    expect(screen.getByText('Опис')).toBeOnTheScreen()
    expect(screen.getByText('3')).toBeOnTheScreen()

    await rerender(<SectionTitle title="Без опису" />)

    expect(screen.getByText('Без опису')).toBeOnTheScreen()
  })
})

describe('Pill', () => {
  it('renders every tone with dot and icon', async () => {
    const tones = ['success', 'warning', 'danger', 'neutral', 'primary'] as const

    await render(
      <>
        {tones.map((tone) => (
          <Pill dot icon="bird" key={tone} label={tone} tone={tone} />
        ))}
      </>,
    )

    for (const tone of tones) {
      expect(screen.getByText(tone)).toBeOnTheScreen()
    }

    expect(screen.getAllByText('bird')).toHaveLength(tones.length)
  })

  it('renders without dot or icon', async () => {
    await render(<Pill label="Просто" />)

    expect(screen.getByText('Просто')).toBeOnTheScreen()
    expect(screen.queryByText('bird')).not.toBeOnTheScreen()
  })
})

describe('Banner', () => {
  it('renders every tone and closes', async () => {
    const onClose = jest.fn()
    const tones = ['error', 'success', 'info', 'warning'] as const

    await render(
      <>
        {tones.map((tone) => (
          <Banner key={tone} message={`Повідомлення ${tone}`} tone={tone} />
        ))}
        <Banner message="Закривається" onClose={onClose} />
      </>,
    )

    for (const tone of tones) {
      expect(screen.getByText(`Повідомлення ${tone}`)).toBeOnTheScreen()
    }

    await fireEvent.press(screen.getByLabelText('Закрити'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('omits the close button without a handler', async () => {
    await render(<Banner message="Без кнопки" />)

    expect(screen.queryByLabelText('Закрити')).not.toBeOnTheScreen()
  })
})

describe('EmptyState', () => {
  it('renders icon, texts and action', async () => {
    const onPress = jest.fn()

    await render(
      <EmptyState
        action={<AppButton label="Дія" onPress={onPress} />}
        icon="history"
        message="Порожньо"
        title="Нічого немає"
      />,
    )

    expect(screen.getByText('history')).toBeOnTheScreen()
    expect(screen.getByText('Нічого немає')).toBeOnTheScreen()
    expect(screen.getByText('Порожньо')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Дія' }))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('uses the default icon', async () => {
    await render(<EmptyState message="Опис" title="Заголовок" />)

    expect(screen.getByText('bird')).toBeOnTheScreen()
  })
})

describe('LoadingBlock', () => {
  it('renders the default and custom labels', async () => {
    const { rerender } = await render(<LoadingBlock />)

    expect(screen.getByText('Завантаження...')).toBeOnTheScreen()

    await rerender(<LoadingBlock label="Чекаємо..." />)

    expect(screen.getByText('Чекаємо...')).toBeOnTheScreen()
  })
})

describe('ConfirmDialog', () => {
  it('renders a destructive dialog and handles both actions', async () => {
    const onCancel = jest.fn()
    const onConfirm = jest.fn()

    await render(
      <ConfirmDialog
        destructive
        message="Запис буде видалено"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Видалити запис?"
        visible
      />,
    )

    expect(screen.getByText('Видалити запис?')).toBeOnTheScreen()
    expect(screen.getByText('Запис буде видалено')).toBeOnTheScreen()

    await fireEvent.press(screen.getByText('Скасувати'))
    await fireEvent.press(screen.getByText('Підтвердити'))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('uses custom labels and disables actions while busy', async () => {
    const onCancel = jest.fn()
    const onConfirm = jest.fn()

    await render(
      <ConfirmDialog
        busy
        cancelLabel="Назад"
        confirmLabel="Так"
        message="Опис"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="Питання"
        visible
      />,
    )

    expect(screen.getByText('Назад')).toBeDisabled()
    expect(screen.getByText('Так')).toBeDisabled()
  })

  it('renders nothing when hidden', async () => {
    await render(
      <ConfirmDialog
        message="Опис"
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
        title="Приховано"
        visible={false}
      />,
    )

    expect(screen.queryByText('Приховано')).not.toBeOnTheScreen()
  })
})
