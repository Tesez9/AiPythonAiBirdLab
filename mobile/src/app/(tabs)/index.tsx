import { useEffect, useState } from 'react'
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
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
  API_BASE,
  assetName,
  fetchHealth,
  type Analysis,
  type Health,
  validateImageAsset,
} from '@/lib/api'
import { errorMessage, formatBytes } from '@/lib/format'
import { colors, radii } from '@/lib/theme'

export default function AnalyzeScreen() {
  const router = useRouter()
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [result, setResult] = useState<Analysis | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

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

  async function handleAnalyze() {
    if (!asset) {
      setError('Спочатку виберіть фото птаха.')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setNotice(null)

    try {
      const analysis = await analyzeImage(asset)

      setResult(analysis)
      setAsset(null)
      setNotice(`Розпізнано: ${analysis.predicted_species}.`)
    } catch (analyzeError) {
      setError(errorMessage(analyzeError))
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
