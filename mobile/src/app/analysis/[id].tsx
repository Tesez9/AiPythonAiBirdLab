import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { AnalysisResult } from '@/components/AnalysisResult'
import {
  AppButton,
  Banner,
  ConfirmDialog,
  LoadingBlock,
} from '@/components/ui'
import {
  deleteAnalysis,
  getAnalysis,
  type Analysis,
} from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { colors, radii } from '@/lib/theme'

export default function AnalysisDetailsScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const analysisId = Number(id)
  const isValidId = Number.isInteger(analysisId) && analysisId > 0
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [isLoading, setIsLoading] = useState(isValidId)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(
    isValidId ? null : 'Некоректний ідентифікатор запису.',
  )

  useEffect(() => {
    if (!isValidId) {
      return
    }

    let active = true

    async function load() {
      try {
        const next = await getAnalysis(analysisId)

        if (active) {
          setAnalysis(next)
        }
      } catch (loadError) {
        if (active) {
          setError(errorMessage(loadError))
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [analysisId, isValidId])

  async function handleDelete() {
    if (!analysis) {
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      await deleteAnalysis(analysis.id)
      setConfirmDelete(false)
      router.back()
    } catch (deleteError) {
      setConfirmDelete(false)
      setError(errorMessage(deleteError))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Назад"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            pressed && styles.backButtonPressed,
          ]}
        >
          <MaterialCommunityIcons
            color={colors.primary}
            name="arrow-left"
            size={22}
          />
        </Pressable>
        <Text style={styles.topTitle}>Деталі аналізу</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <Banner
            message={error}
            onClose={() => setError(null)}
            style={styles.message}
          />
        ) : null}

        {isLoading ? (
          <LoadingBlock label="Завантажуємо запис..." />
        ) : analysis ? (
          <>
            <AnalysisResult analysis={analysis} />
            <AppButton
              icon="trash-can-outline"
              label="Видалити запис"
              onPress={() => setConfirmDelete(true)}
              style={styles.deleteButton}
              variant="danger"
            />
          </>
        ) : (
          <View style={styles.notFound}>
            <MaterialCommunityIcons
              color={colors.primary}
              name="bird"
              size={32}
            />
            <Text style={styles.notFoundTitle}>Запис не знайдено</Text>
            <Text style={styles.notFoundText}>
              Можливо, його вже видалили. Поверніться до історії.
            </Text>
            <AppButton
              compact
              label="До історії"
              onPress={() => router.replace('/history')}
              variant="secondary"
            />
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        busy={isDeleting}
        confirmLabel="Видалити"
        destructive
        message={
          analysis
            ? `${analysis.predicted_species} · ${analysis.image_name}. Фото також буде видалено.`
            : ''
        }
        onCancel={() => {
          if (!isDeleting) {
            setConfirmDelete(false)
          }
        }}
        onConfirm={() => {
          void handleDelete()
        }}
        title="Видалити запис?"
        visible={confirmDelete}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  topTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  topSpacer: {
    height: 38,
    width: 38,
  },
  content: {
    gap: 12,
    paddingBottom: 24,
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  message: {
    marginTop: -2,
  },
  deleteButton: {
    marginTop: 2,
  },
  notFound: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  notFoundTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  notFoundText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
})
