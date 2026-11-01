import type { ComponentProps, ReactNode } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'

import { colors, radii } from '@/lib/theme'

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name']
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type PillTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary'
type BannerTone = 'error' | 'success' | 'info' | 'warning'

const buttonColors: Record<
  ButtonVariant,
  { background: string; border: string; text: string; icon: string }
> = {
  primary: {
    background: colors.primary,
    border: colors.primary,
    text: colors.white,
    icon: colors.white,
  },
  secondary: {
    background: colors.surface,
    border: colors.border,
    text: colors.primary,
    icon: colors.primary,
  },
  danger: {
    background: colors.danger,
    border: colors.danger,
    text: colors.white,
    icon: colors.white,
  },
  ghost: {
    background: 'transparent',
    border: 'transparent',
    text: colors.primary,
    icon: colors.primary,
  },
}

const pillColors: Record<PillTone, { background: string; text: string }> = {
  success: { background: colors.successSoft, text: colors.success },
  warning: { background: colors.warningSoft, text: colors.warning },
  danger: { background: colors.dangerSoft, text: colors.danger },
  neutral: { background: colors.surfaceMuted, text: colors.muted },
  primary: { background: colors.primarySoft, text: colors.primary },
}

const bannerColors: Record<
  BannerTone,
  { background: string; border: string; text: string; icon: IconName }
> = {
  error: {
    background: colors.dangerSoft,
    border: '#E8C1B9',
    text: colors.danger,
    icon: 'alert-circle-outline',
  },
  success: {
    background: colors.successSoft,
    border: '#BBDCCB',
    text: colors.success,
    icon: 'check-circle-outline',
  },
  info: {
    background: colors.primarySoft,
    border: '#C6DCCF',
    text: colors.primary,
    icon: 'information-outline',
  },
  warning: {
    background: colors.warningSoft,
    border: '#E8D3A5',
    text: colors.warning,
    icon: 'alert-outline',
  },
}

type AppButtonProps = {
  label: string
  onPress: () => void
  icon?: IconName
  variant?: ButtonVariant
  disabled?: boolean
  loading?: boolean
  compact?: boolean
  style?: StyleProp<ViewStyle>
}

export function AppButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  compact = false,
  style,
}: AppButtonProps) {
  const palette = buttonColors[variant]
  const inactive = disabled || loading

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        inactive && styles.buttonInactive,
        pressed && !inactive && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.icon} size="small" />
      ) : icon ? (
        <MaterialCommunityIcons color={palette.icon} name={icon} size={18} />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          compact && styles.buttonTextCompact,
          { color: palette.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function Card({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Pill({
  label,
  tone = 'neutral',
  icon,
  dot = false,
}: {
  label: string
  tone?: PillTone
  icon?: IconName
  dot?: boolean
}) {
  const palette = pillColors[tone]

  return (
    <View style={[styles.pill, { backgroundColor: palette.background }]}>
      {dot ? (
        <View style={[styles.pillDot, { backgroundColor: palette.text }]} />
      ) : null}
      {icon ? (
        <MaterialCommunityIcons
          color={palette.text}
          name={icon}
          size={14}
        />
      ) : null}
      <Text style={[styles.pillText, { color: palette.text }]}>
        {label}
      </Text>
    </View>
  )
}

export function Banner({
  message,
  tone = 'error',
  onClose,
  style,
}: {
  message: string
  tone?: BannerTone
  onClose?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const palette = bannerColors[tone]

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      <MaterialCommunityIcons
        color={palette.text}
        name={palette.icon}
        size={20}
      />
      <Text style={[styles.bannerText, { color: palette.text }]}>
        {message}
      </Text>
      {onClose ? (
        <Pressable
          accessibilityLabel="Закрити"
          hitSlop={10}
          onPress={onClose}
        >
          <MaterialCommunityIcons
            color={palette.text}
            name="close"
            size={18}
          />
        </Pressable>
      ) : null}
    </View>
  )
}

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderText}>
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.screenSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {right ? <View style={styles.screenHeaderRight}>{right}</View> : null}
    </View>
  )
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? (
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  )
}

export function EmptyState({
  icon = 'bird',
  title,
  message,
  action,
}: {
  icon?: IconName
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <View style={styles.emptyState}>
      <MaterialCommunityIcons
        color={colors.primary}
        name={icon}
        size={26}
        style={styles.emptyIcon}
      />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
    </View>
  )
}

export function LoadingBlock({ label = 'Завантаження...' }: { label?: string }) {
  return (
    <View style={styles.loadingBlock}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  )
}

export function StatTile({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Підтвердити',
  cancelLabel = 'Скасувати',
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Text style={styles.modalMessage}>{message}</Text>
          <View style={styles.modalActions}>
            <AppButton
              compact
              disabled={busy}
              label={cancelLabel}
              onPress={onCancel}
              style={styles.modalButton}
              variant="secondary"
            />
            <AppButton
              compact
              label={confirmLabel}
              loading={busy}
              onPress={onConfirm}
              style={styles.modalButton}
              variant={destructive ? 'danger' : 'primary'}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonCompact: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  buttonInactive: {
    opacity: 0.48,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextCompact: {
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    padding: 14,
  },
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 4,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  pillDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  banner: {
    alignItems: 'center',
    borderRadius: radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  bannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  screenHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  screenHeaderText: {
    flex: 1,
  },
  screenHeaderRight: {
    paddingTop: 2,
  },
  screenTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 29,
  },
  screenSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  sectionTitleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sectionTitleText: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    maxWidth: 300,
    textAlign: 'center',
  },
  loadingBlock: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 38,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  statTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    flex: 1,
    minHeight: 96,
    padding: 12,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.large,
    maxWidth: 420,
    padding: 18,
    width: '100%',
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  modalButton: {
    flex: 1,
  },
})
