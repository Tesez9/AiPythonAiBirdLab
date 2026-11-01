import { useCallback, useState } from 'react'
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { useFocusEffect, useRouter } from 'expo-router'

import {
  AppButton,
  Banner,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadingBlock,
  Pill,
  ScreenHeader,
} from '@/components/ui'
import {
  assetUrl,
  deleteAnalysis,
  listAnalyses,
  type Analysis,
} from '@/lib/api'
import { errorMessage, formatDate, percent } from '@/lib/format'
import { colors, radii } from '@/lib/theme'

function scoreTone(confidence: number): 'success' | 'primary' | 'warning' {
  if (confidence >= 0.85) {
    return 'success'
  }

  if (confidence >= 0.6) {
    return 'primary'
  }

  return 'warning'
}

function ItemSeparator() {
  return <View style={styles.separator} />
}

export default function HistoryScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [items, setItems] = useState<Analysis[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(
    async (search: string, mode: 'load' | 'refresh' = 'load') => {
      if (mode === 'refresh') {
        setIsRefreshing(true)
      } else {
        setIsLoading(true)
      }

      setError(null)

      try {
        const page = await listAnalyses(search)

        setItems(page.items)
        setTotal(page.total)
      } catch (loadError) {
        setError(errorMessage(loadError))
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [],
  )

  useFocusEffect(
    useCallback(() => {
      void load(appliedQuery)
    }, [appliedQuery, load]),
  )

  function handleSearch() {
    const nextQuery = query.trim()

    setNotice(null)

    if (nextQuery === appliedQuery) {
      void load(nextQuery)
      return
    }

    setAppliedQuery(nextQuery)
  }

  function clearSearch() {
    setQuery('')
    setNotice(null)

    if (appliedQuery) {
      setAppliedQuery('')
      return
    }

    void load('')
  }

  async function removePending() {
    if (!pendingDelete) {
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      await deleteAnalysis(pendingDelete.id)
      setPendingDelete(null)
      setNotice('Запис видалено з історії.')
      await load(appliedQuery)
    } catch (deleteError) {
      setPendingDelete(null)
      setError(errorMessage(deleteError))
    } finally {
      setIsDeleting(false)
    }
  }

  function renderItem({ item }: { item: Analysis }) {
    const thumbnail = assetUrl(item.image_url)

    return (
      <View style={styles.rowCard}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: '/analysis/[id]',
              params: { id: String(item.id) },
            })
          }
          style={({ pressed }) => [
            styles.rowMain,
            pressed && styles.rowPressed,
          ]}
        >
          {thumbnail ? (
            <Image
              accessibilityIgnoresInvertColors
              source={{ uri: thumbnail }}
              style={styles.thumb}
            />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <MaterialCommunityIcons
                color={colors.primary}
                name="bird"
                size={22}
              />
            </View>
          )}

          <View style={styles.rowText}>
            <Text numberOfLines={1} style={styles.species}>
              {item.predicted_species}
            </Text>
            <Text numberOfLines={1} style={styles.meta}>
              {formatDate(item.analysis_date)} · {item.image_name}
            </Text>
            <View style={styles.badgeRow}>
              <Pill
                label={percent(item.confidence)}
                tone={scoreTone(item.confidence)}
              />
              {item.low_confidence ? (
                <Text style={styles.lowConfidence}>низька впевненість</Text>
              ) : null}
            </View>
          </View>

          <MaterialCommunityIcons
            color={colors.muted}
            name="chevron-right"
            size={21}
          />
        </Pressable>

        <Pressable
          accessibilityLabel={`Видалити ${item.predicted_species}`}
          hitSlop={6}
          onPress={() => setPendingDelete(item)}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.deleteButtonPressed,
          ]}
        >
          <MaterialCommunityIcons
            color={colors.danger}
            name="trash-can-outline"
            size={19}
          />
        </Pressable>
      </View>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        ItemSeparatorComponent={ItemSeparator}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          isLoading ? (
            <LoadingBlock label="Завантажуємо історію..." />
          ) : (
            <Card>
              <EmptyState
                icon="history"
                message={
                  appliedQuery
                    ? `За запитом «${appliedQuery}» нічого не знайдено.`
                    : 'Проаналізуйте перше фото — записи з’являться тут.'
                }
                title={appliedQuery ? 'Нічого не знайдено' : 'Історія порожня'}
              />
            </Card>
          )
        }
        ListFooterComponent={<View style={styles.footerSpace} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <ScreenHeader
              subtitle="Усі розпізнавання, пошук і керування записами"
              title="Історія"
            />

            <Card style={styles.searchCard}>
              <View style={styles.searchRow}>
                <View style={styles.searchInputWrap}>
                  <MaterialCommunityIcons
                    color={colors.muted}
                    name="magnify"
                    size={19}
                  />
                  <TextInput
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                    onChangeText={setQuery}
                    onSubmitEditing={handleSearch}
                    placeholder="Вид або назва файлу"
                    placeholderTextColor={colors.muted}
                    returnKeyType="search"
                    style={styles.searchInput}
                    value={query}
                  />
                </View>
                <AppButton
                  compact
                  label="Знайти"
                  onPress={handleSearch}
                />
              </View>

              {appliedQuery ? (
                <View style={styles.appliedRow}>
                  <Text numberOfLines={1} style={styles.appliedText}>
                    Запит: {appliedQuery}
                  </Text>
                  <Pressable onPress={clearSearch}>
                    <Text style={styles.clearText}>Скинути</Text>
                  </Pressable>
                </View>
              ) : null}
            </Card>

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

            <View style={styles.countRow}>
              <Text style={styles.countText}>
                {isLoading ? 'Оновлення...' : `Знайдено: ${total}`}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={isRefreshing}
                onPress={() => {
                  void load(appliedQuery, 'refresh')
                }}
                style={styles.refreshButton}
              >
                <MaterialCommunityIcons
                  color={colors.primary}
                  name="refresh"
                  size={16}
                />
                <Text style={styles.refreshText}>Оновити</Text>
              </Pressable>
            </View>
          </View>
        }
        onRefresh={() => {
          void load(appliedQuery, 'refresh')
        }}
        refreshing={isRefreshing}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />

      <ConfirmDialog
        busy={isDeleting}
        confirmLabel="Видалити"
        destructive
        message={
          pendingDelete
            ? `${pendingDelete.predicted_species} · ${pendingDelete.image_name}. Фото також буде видалено.`
            : ''
        }
        onCancel={() => {
          if (!isDeleting) {
            setPendingDelete(null)
          }
        }}
        onConfirm={() => {
          void removePending()
        }}
        title="Видалити запис?"
        visible={Boolean(pendingDelete)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.background,
    flex: 1,
  },
  listContent: {
    paddingBottom: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  listHeader: {
    gap: 12,
    marginBottom: 14,
  },
  searchCard: {
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 6,
  },
  searchInputWrap: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 9,
  },
  searchInput: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    paddingVertical: 7,
  },
  appliedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  appliedText: {
    color: colors.muted,
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
  },
  clearText: {
    color: colors.danger,
    fontSize: 10,
    fontWeight: '600',
  },
  message: {
    marginTop: -2,
  },
  countRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  countText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  refreshButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 4,
  },
  refreshText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  rowCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.large,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    padding: 8,
  },
  rowMain: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minWidth: 0,
    padding: 2,
  },
  rowPressed: {
    opacity: 0.7,
  },
  thumb: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.small,
    height: 54,
    width: 54,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.small,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  rowText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  species: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 10,
  },
  badgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 2,
  },
  lowConfidence: {
    color: colors.warning,
    fontSize: 9,
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.small,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  deleteButtonPressed: {
    opacity: 0.6,
  },
  separator: {
    height: 8,
  },
  footerSpace: {
    height: 4,
  },
})
