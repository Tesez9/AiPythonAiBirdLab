import { useCallback, useEffect, useState } from 'react'
import {
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Linking from 'expo-linking'
import { useRouter } from 'expo-router'

import { AnalysisResult } from '@/components/AnalysisResult'
import {
  AppButton,
  Banner,
  Card,
  EmptyState,
  Pill,
  ScreenHeader,
  SectionTitle,
} from '@/components/ui'
import {
  analyzeImage,
  ApiError,
  API_BASE,
  assetName,
  checkPayments,
  fetchHealth,
  fetchPaymentConfig,
  fetchWallet,
  type Analysis,
  type Health,
  type PaymentConfig,
  type PaymentResult,
  type WalletInfo,
  validateImageAsset,
} from '@/lib/api'
import { errorMessage, formatBytes } from '@/lib/format'
import {
  creditsLabel,
  isValidAddress,
  metamaskPaymentUrl,
  normalizeAddress,
  shortAddress,
} from '@/lib/wallet'
import { colors, radii } from '@/lib/theme'

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export default function AnalyzeScreen() {
  const router = useRouter()
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [result, setResult] = useState<Analysis | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null)
  const [walletAddress, setWalletAddress] = useState('')
  const [walletInput, setWalletInput] = useState('')
  const [wallet, setWallet] = useState<WalletInfo | null>(null)
  const [isSavingWallet, setIsSavingWallet] = useState(false)
  const [isCheckingPayment, setIsCheckingPayment] = useState(false)
  const [awaitingPayment, setAwaitingPayment] = useState(false)

  const checkWalletPayment = useCallback(
    async (address: string, waitForConfirmation = false) => {
      setIsCheckingPayment(true)
      setError(null)
      setNotice(null)

      const attempts = waitForConfirmation ? 20 : 1

      try {
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          let result: PaymentResult

          try {
            result = await checkPayments(address)
          } catch (checkError) {
            if (
              waitForConfirmation &&
              checkError instanceof ApiError &&
              checkError.status === 404 &&
              attempt < attempts - 1
            ) {
              setNotice('Очікуємо підтвердження транзакції...')
              await wait(1500)
              continue
            }

            throw checkError
          }

          if (result.status === 'pending') {
            setNotice(
              `Транзакція ще не підтверджена: ${
                result.confirmations ?? 0
              }/${result.required ?? 1}.`,
            )

            if (waitForConfirmation && attempt < attempts - 1) {
              await wait(1500)
              continue
            }

            return
          }

          setWallet(await fetchWallet(address))
          setNotice(`Оплату зараховано: ${creditsLabel(result.credits ?? 0)}.`)
          return
        }
      } catch (checkError) {
        if (checkError instanceof ApiError && checkError.status === 404) {
          setError(
            'Нову оплату не знайдено. Переконайтеся, що транзакція підтверджена.',
          )
        } else {
          setError(errorMessage(checkError))
        }
      } finally {
        setIsCheckingPayment(false)
      }
    },
    [],
  )

  useEffect(() => {
    let active = true

    async function loadPayments() {
      try {
        const config = await fetchPaymentConfig()

        if (active) {
          setPaymentConfig(config)
        }
      } catch {
        if (active) {
          setPaymentConfig(null)
        }
      }
    }

    void loadPayments()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!awaitingPayment || !walletAddress) {
      return
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setAwaitingPayment(false)
        void checkWalletPayment(walletAddress, true)
      }
    })

    return () => subscription.remove()
  }, [awaitingPayment, walletAddress, checkWalletPayment])

  useEffect(() => {
    let active = true

    async function loadHealth() {
      try {
        const nextHealth = await fetchHealth()

        if (active) {
          setHealth(nextHealth)
        }
      } catch {
        if (active) {
          setHealth(null)
        }
      }
    }

    void loadHealth()
    const timer = setInterval(() => {
      void loadHealth()
    }, 10000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  async function pickPhoto(source: 'library' | 'camera') {
    setError(null)
    setNotice(null)

    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()

      if (!permission.granted) {
        setError(
          source === 'camera'
            ? 'Потрібен дозвіл на використання камери.'
            : 'Потрібен дозвіл на доступ до галереї.',
        )
        return
      }

      const options: ImagePicker.ImagePickerOptions = {
        allowsEditing: false,
        mediaTypes: ['images'],
        quality: 0.9,
      }
      const picked =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options)

      if (picked.canceled || !picked.assets[0]) {
        return
      }

      const nextAsset = picked.assets[0]
      const validation = validateImageAsset(nextAsset)

      if (validation) {
        setError(validation)
        return
      }

      setAsset(nextAsset)
      setResult(null)
    } catch (pickError) {
      setError(errorMessage(pickError))
    }
  }

  async function handleSaveWallet() {
    const address = normalizeAddress(walletInput)

    if (!isValidAddress(address)) {
      setError('Введіть коректну адресу гаманця у форматі 0x...')
      return
    }

    setIsSavingWallet(true)
    setError(null)
    setNotice(null)

    try {
      const info = await fetchWallet(address)

      setWalletAddress(address)
      setWallet(info)
      setWalletInput(address)
      setNotice(`Гаманець збережено. ${creditsLabel(info.credits)}.`)
    } catch (walletError) {
      setError(errorMessage(walletError))
    } finally {
      setIsSavingWallet(false)
    }
  }

  async function handlePay() {
    if (!paymentConfig) {
      return
    }

    if (!walletAddress) {
      setError('Спочатку збережіть адресу гаманця.')
      return
    }

    setError(null)
    setNotice(null)

    try {
      await Linking.openURL(metamaskPaymentUrl(paymentConfig))
      setAwaitingPayment(true)
      setNotice(
        'Підтвердіть оплату в MetaMask. Після повернення в застосунок баланс перевіриться автоматично.',
      )
    } catch {
      setError(
        'Не вдалося відкрити MetaMask. Перевірте, чи встановлений застосунок MetaMask.',
      )
    }
  }

  async function handleAnalyze() {
    if (!asset) {
      setError('Спочатку виберіть фото птаха.')
      return
    }

    if (paymentConfig?.enabled && !walletAddress) {
      setError('Збережіть адресу гаманця, щоб оплатити аналіз.')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setNotice(null)

    try {
      const analysis = await analyzeImage(
        asset,
        paymentConfig?.enabled ? walletAddress : null,
      )
      const creditsLeft = analysis.credits_left

      setResult(analysis)
      setAsset(null)

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
    } catch (analyzeError) {
      if (analyzeError instanceof ApiError && analyzeError.status === 402) {
        setError(
          'Оплачені аналізи закінчилися. Придбайте новий пакет через MetaMask.',
        )
      } else {
        setError(errorMessage(analyzeError))
      }
    } finally {
      setIsAnalyzing(false)
    }
  }

  const healthLabel = !health
    ? 'Offline'
    : health.status === 'ok'
      ? 'Онлайн'
      : 'AI offline'
  const healthTone = !health
    ? 'danger'
    : health.status === 'ok'
      ? 'success'
      : 'warning'

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          right={
            <Pill
              dot
              label={healthLabel}
              tone={healthTone}
            />
          }
          subtitle="Класифікація птахів за фото"
          title="AI Bird Lab"
        />

        {error ? (
          <Banner
            message={error}
            onClose={() => setError(null)}
            style={styles.message}
          />
        ) : null}
        {notice ? (
          <Banner
            message={notice}
            onClose={() => setNotice(null)}
            style={styles.message}
            tone="success"
          />
        ) : null}

        {paymentConfig?.enabled ? (
          <Card style={styles.walletCard}>
            <SectionTitle
              subtitle={`${creditsLabel(paymentConfig.credits)} за ${
                paymentConfig.price_eth
              } ETH · ${paymentConfig.chain_name}`}
              title="Оплата аналізів"
            />

            <Text style={styles.walletLabel}>Адреса гаманця</Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setWalletInput}
              placeholder="0x..."
              placeholderTextColor={colors.muted}
              style={styles.walletInput}
              value={walletInput}
            />

            <View style={styles.walletRow}>
              <AppButton
                compact
                label={
                  isSavingWallet
                    ? 'Перевіряємо...'
                    : walletAddress
                      ? 'Оновити гаманець'
                      : 'Зберегти гаманець'
                }
                loading={isSavingWallet}
                onPress={() => {
                  void handleSaveWallet()
                }}
                style={styles.walletButton}
                variant="secondary"
              />
              {wallet ? (
                <Pill
                  label={creditsLabel(wallet.credits)}
                  tone={wallet.credits > 0 ? 'success' : 'neutral'}
                />
              ) : null}
            </View>

            {walletAddress ? (
              <Text style={styles.walletAddress}>
                Гаманець: {shortAddress(walletAddress)}
              </Text>
            ) : null}

            <AppButton
              disabled={!walletAddress || awaitingPayment}
              icon="ethereum"
              label={
                awaitingPayment
                  ? 'Очікуємо повернення...'
                  : `Оплатити ${paymentConfig.price_eth} ETH`
              }
              onPress={() => {
                void handlePay()
              }}
            />

            <AppButton
              disabled={!walletAddress}
              label={isCheckingPayment ? 'Перевіряємо...' : 'Перевірити оплату'}
              loading={isCheckingPayment}
              onPress={() => {
                void checkWalletPayment(walletAddress)
              }}
              variant="secondary"
            />

            <Text style={styles.walletHint}>
              MetaMask відкриється з готовою транзакцією на{' '}
              {paymentConfig.receiver}. Переконайтеся, що в MetaMask вибрано
              той самий акаунт. Після повернення в застосунок баланс
              перевіриться автоматично.
            </Text>
          </Card>
        ) : null}

        <Card style={styles.uploadCard}>
          <SectionTitle
            subtitle="JPG, JPEG або PNG · до 10 МБ"
            title="Аналіз фото"
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void pickPhoto('library')
            }}
            style={({ pressed }) => [
              styles.dropzone,
              pressed && styles.dropzonePressed,
            ]}
          >
            {asset ? (
              <Image
                accessibilityIgnoresInvertColors
                source={{ uri: asset.uri }}
                style={styles.preview}
              />
            ) : (
              <View style={styles.dropzoneContent}>
                <Text style={styles.dropzoneTitle}>Виберіть фото птаха</Text>
                <Text style={styles.dropzoneHint}>
                  Натисніть тут, щоб відкрити галерею
                </Text>
              </View>
            )}
          </Pressable>

          {asset ? (
            <View style={styles.assetMeta}>
              <View style={styles.assetMetaText}>
                <Text numberOfLines={1} style={styles.assetName}>
                  {assetName(asset)}
                </Text>
                <Text style={styles.assetSize}>
                  {formatBytes(asset.fileSize) || 'Фото готове до аналізу'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Прибрати фото"
                hitSlop={10}
                onPress={() => {
                  setAsset(null)
                  setResult(null)
                }}
              >
                <Text style={styles.removeText}>Видалити</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.pickRow}>
            <AppButton
              label="Галерея"
              onPress={() => {
                void pickPhoto('library')
              }}
              style={styles.pickButton}
              variant="secondary"
            />
            <AppButton
              label="Камера"
              onPress={() => {
                void pickPhoto('camera')
              }}
              style={styles.pickButton}
              variant="secondary"
            />
          </View>

          <AppButton
            disabled={!asset}
            label={isAnalyzing ? 'Аналізуємо...' : 'Аналізувати фото'}
            loading={isAnalyzing}
            onPress={() => {
              void handleAnalyze()
            }}
          />

          <Text style={styles.serverHint}>Сервер: {API_BASE}</Text>
        </Card>

        {result ? (
          <View style={styles.resultSection}>
            <SectionTitle
              right={
                <AppButton
                  compact
                  label="Очистити"
                  onPress={() => setResult(null)}
                  variant="ghost"
                />
              }
              subtitle="Натисніть на запис в історії, щоб відкрити його деталі"
              title="Результат"
            />
            <AnalysisResult analysis={result} />
          </View>
        ) : (
          <Card>
            <EmptyState
              action={
                <AppButton
                  compact
                  label="Відкрити історію"
                  onPress={() => router.push('/history')}
                  style={styles.emptyAction}
                  variant="secondary"
                />
              }
              message="Виберіть фото або зробіть знімок — розпізнаний вид, TOP-3 та довідник з’являться тут."
              title="Тут з’явиться результат"
            />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 24,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  message: {
    marginTop: -2,
  },
  walletCard: {
    gap: 10,
  },
  walletLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  walletInput: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    color: colors.text,
    fontFamily: Platform.select({
      android: 'monospace',
      ios: 'Menlo',
      default: 'monospace',
    }),
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  walletRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  walletButton: {
    flexGrow: 1,
  },
  walletAddress: {
    color: colors.muted,
    fontSize: 11,
  },
  walletHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  uploadCard: {
    gap: 12,
  },
  dropzone: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderStyle: 'dashed',
    borderWidth: 1,
    minHeight: 160,
    overflow: 'hidden',
  },
  dropzonePressed: {
    opacity: 0.75,
  },
  dropzoneContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 160,
    padding: 16,
  },
  dropzoneTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  dropzoneHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  preview: {
    height: 200,
    resizeMode: 'cover',
    width: '100%',
  },
  assetMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  assetMetaText: {
    flex: 1,
  },
  assetName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  assetSize: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 2,
  },
  removeText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },
  pickRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pickButton: {
    flex: 1,
  },
  serverHint: {
    color: colors.muted,
    fontSize: 10,
    textAlign: 'center',
  },
  resultSection: {
    gap: 10,
  },
  emptyAction: {
    marginTop: 12,
  },
})
