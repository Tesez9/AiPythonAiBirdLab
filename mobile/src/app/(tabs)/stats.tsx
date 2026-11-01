import { useCallback, useState } from 'react'
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Sharing from 'expo-sharing'
import { useFocusEffect } from 'expo-router'

import {
  AppButton,
  Banner,
  Card,
  EmptyState,
  LoadingBlock,
  Pill,
  ScreenHeader,
  SectionTitle,
  StatTile,
} from '@/components/ui'
import {
  CSV_URL,
  downloadCsv,
  getStats,
  type Analysis,
  type Stats,
} from '@/lib/api'
import { errorMessage, percent } from '@/lib/format'
import { colors, radii } from '@/lib/theme'

function RecordRow({
  label,
  analysis,
}: {
  label: string
  analysis: Analysis | null
}) {
  return (
    <View style={styles.recordRow}>
      <Text style={styles.recordLabel}>{label}</Text>
      {analysis ? (
        <View style={styles.recordValueRow}>
          <Text numberOfLines={1} style={styles.recordSpecies}>
            {analysis.predicted_species}
          </Text>
          <Pill
            label={percent(analysis.confidence)}
            tone={analysis.confidence >= 0.6 ? 'success' : 'warning'}
          />
        </View>
      ) : (
        <Text style={styles.recordEmpty}>—</Text>
      )}
    </View>
  )
}

export default function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      setStats(await getStats())
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  async function handleExport() {
    setIsExporting(true)
    setError(null)
    setNotice(null)

    try {
      if (Platform.OS === 'web') {
        window.open(CSV_URL, '_blank', 'noopener,noreferrer')
        setNotice('CSV відкрито у новій вкладці.')
        return
      }

      const file = await downloadCsv()
      const sharingAvailable = await Sharing.isAvailableAsync()

      if (sharingAvailable) {
        await Sharing.shareAsync(file.uri, {
          dialogTitle: 'Експорт CSV',
          mimeType: 'text/csv',
          UTI: 'public.comma-separated-values-text',
        })
        setNotice(`Експортовано ${stats?.total ?? 0} записів.`)
      } else {
        setNotice(`CSV збережено у кеші застосунку: ${file.uri}`)
      }
    } catch (exportError) {
      setError(errorMessage(exportError))
    } finally {
      setIsExporting(false)
    }
  }

  const average = Math.min(Math.max(stats?.average_confidence ?? 0, 0.02), 1)
  const maxSpeciesCount = Math.max(
    1,
    ...(stats?.top_species.map((entry) => entry.count) ?? [1]),
  )

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          right={
            stats ? (
              <Pill label={`${stats.total} записів`} tone="primary" />
            ) : undefined
          }
          subtitle="Зведення по всіх збережених аналізах"
          title="Статистика"
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

        {isLoading && !stats ? (
          <LoadingBlock label="Рахуємо статистику..." />
        ) : stats ? (
          <>
            <View style={styles.metricRow}>
              <StatTile label="Всього аналізів" value={String(stats.total)} />
              <StatTile
                label="Унікальних видів"
                value={String(stats.unique_species)}
              />
            </View>

            <Card style={styles.averageCard}>
              <Text style={styles.averageLabel}>Середня впевненість</Text>
              <Text style={styles.averageValue}>
                {percent(stats.average_confidence)}
              </Text>
              <View style={styles.averageTrack}>
                <View style={[styles.averageFill, { flex: average }]} />
                <View style={{ flex: Math.max(1 - average, 0.02) }} />
              </View>
            </Card>

            <Card style={styles.sectionCard}>
              <SectionTitle
                subtitle="Найвищий і найнижчий результати"
                title="Рекорди"
              />
              <View style={styles.records}>
                <RecordRow
                  analysis={stats.highest}
                  label="Найвища впевненість"
                />
                <RecordRow
                  analysis={stats.lowest}
                  label="Найнижча впевненість"
                />
              </View>
            </Card>

            <Card style={styles.sectionCard}>
              <SectionTitle
                subtitle="Топ-5 за кількістю розпізнавань"
                title="Найчастіші види"
              />
              {stats.top_species.length > 0 ? (
                <View style={styles.speciesList}>
                  {stats.top_species.map((entry) => (
                    <View key={entry.species} style={styles.speciesRow}>
                      <View style={styles.speciesInfo}>
                        <View style={styles.speciesLabelRow}>
                          <Text numberOfLines={1} style={styles.speciesName}>
                            {entry.species}
                          </Text>
                          <Text style={styles.speciesCount}>
                            {entry.count}
                          </Text>
                        </View>
                        <View style={styles.speciesTrack}>
                          <View
                            style={[
                              styles.speciesFill,
                              { flex: Math.max(entry.count, 0.1) },
                            ]}
                          />
                          <View
                            style={{
                              flex: Math.max(
                                maxSpeciesCount - entry.count,
                                0.1,
                              ),
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.noData}>Даних ще немає.</Text>
              )}
            </Card>

            <Card style={styles.exportCard}>
              <View style={styles.exportText}>
                <Text style={styles.exportTitle}>Експорт у CSV</Text>
                <Text style={styles.exportHint}>
                  Таблиця з усіма аналізами для Excel або Google Sheets.
                </Text>
              </View>
              <AppButton
                disabled={stats.total === 0}
                icon="download-outline"
                label={isExporting ? 'Експортуємо...' : 'Експортувати CSV'}
                loading={isExporting}
                onPress={() => {
                  void handleExport()
                }}
              />
            </Card>
          </>
        ) : (
          <Card>
            <EmptyState
              icon="chart-box-outline"
              message="Не вдалося отримати статистику. Перевірте з’єднання із сервером."
              title="Статистика недоступна"
              action={
                <AppButton
                  compact
                  label="Спробувати ще раз"
                  onPress={() => {
                    void load()
                  }}
                  style={styles.retryButton}
                  variant="secondary"
                />
              }
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
  metricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  averageCard: {
    gap: 6,
  },
  averageLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  averageValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  averageTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 2,
    flexDirection: 'row',
    height: 6,
    marginTop: 4,
    overflow: 'hidden',
  },
  averageFill: {
    backgroundColor: colors.primary,
  },
  sectionCard: {
    gap: 12,
  },
  records: {
    gap: 8,
  },
  recordRow: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    gap: 4,
    padding: 10,
  },
  recordLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
  },
  recordValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  recordSpecies: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  recordEmpty: {
    color: colors.muted,
    fontSize: 13,
  },
  speciesList: {
    gap: 12,
  },
  speciesRow: {
    gap: 5,
  },
  speciesInfo: {
    gap: 5,
  },
  speciesLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  speciesName: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  speciesCount: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  speciesTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 2,
    flexDirection: 'row',
    height: 5,
    overflow: 'hidden',
  },
  speciesFill: {
    backgroundColor: colors.primary,
  },
  noData: {
    color: colors.muted,
    fontSize: 12,
  },
  exportCard: {
    gap: 12,
  },
  exportText: {
    gap: 2,
  },
  exportTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  exportHint: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
  },
  retryButton: {
    marginTop: 12,
  },
})
