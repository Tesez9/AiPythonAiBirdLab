import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'

import { assetUrl, type Analysis } from '@/lib/api'
import { formatDate, percent } from '@/lib/format'
import { colors, radii } from '@/lib/theme'
import { Banner, Card, Pill, SectionTitle } from './ui'

function confidenceTone(confidence: number): 'success' | 'primary' | 'warning' {
  if (confidence >= 0.85) {
    return 'success'
  }

  if (confidence >= 0.6) {
    return 'primary'
  }

  return 'warning'
}

export function AnalysisResult({ analysis }: { analysis: Analysis }) {
  const imageUri = assetUrl(analysis.image_url)
  const top = analysis.top3 ?? []
  const info = analysis.info ?? null
  const rows: [string, string | null][] = info
    ? [
        ['Українська назва', info.ukrainian],
        ['Наукова назва', info.scientific],
        ['Родина', info.family],
        ['Середовище', info.habitat],
        ['Поширення', info.range],
        ['Живлення', info.diet],
        ['Розміри', info.size],
        ['Статус', info.status],
        ['Цікавий факт', info.facts],
      ]
    : []

  return (
    <View style={styles.wrapper}>
      {imageUri ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: imageUri }}
          style={styles.image}
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>Фото недоступне</Text>
        </View>
      )}

      <Card style={styles.mainCard}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.species}>{analysis.predicted_species}</Text>
            <Text style={styles.date}>
              {formatDate(analysis.analysis_date)}
            </Text>
          </View>
          <Pill
            label={percent(analysis.confidence)}
            tone={confidenceTone(analysis.confidence)}
          />
        </View>

        {analysis.low_confidence ? (
          <Banner
            message="Низька впевненість: результат може бути неточним."
            tone="warning"
          />
        ) : null}

        <Text style={styles.description}>
          {analysis.description || 'Опис відсутній.'}
        </Text>

        {analysis.source ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(analysis.source as string).catch(() => {})
            }}
            style={({ pressed }) => [
              styles.sourceLink,
              pressed && styles.sourceLinkPressed,
            ]}
          >
            <Text style={styles.sourceText}>Відкрити джерело</Text>
          </Pressable>
        ) : null}
      </Card>

      {top.length > 0 ? (
        <Card style={styles.sectionCard}>
          <SectionTitle
            subtitle="Три найімовірніші види за версією моделі"
            title="TOP-3"
          />
          <View style={styles.topList}>
            {top.map((prediction, index) => {
              const confidence = Math.min(
                Math.max(prediction.confidence, 0.02),
                1,
              )

              return (
                <View
                  key={`${prediction.species}-${index}`}
                  style={styles.topRow}
                >
                  <Text style={styles.rankText}>{index + 1}.</Text>
                  <View style={styles.topContent}>
                    <View style={styles.topLabelRow}>
                      <Text numberOfLines={1} style={styles.topSpecies}>
                        {prediction.species}
                      </Text>
                      <Text style={styles.topScore}>
                        {percent(prediction.confidence)}
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { flex: confidence }]} />
                      <View style={{ flex: Math.max(1 - confidence, 0.02) }} />
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        </Card>
      ) : null}

      {info ? (
        <Card style={styles.sectionCard}>
          <SectionTitle
            subtitle={info.scientific || info.family || 'Довідник видів'}
            title="Про вид"
          />
          <View style={styles.infoList}>
            {rows.map(([label, value]) => (
              <View key={label} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value?.trim() || '—'}</Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
  },
  image: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    height: 220,
    resizeMode: 'cover',
    width: '100%',
  },
  imagePlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.medium,
    height: 120,
    justifyContent: 'center',
    width: '100%',
  },
  imagePlaceholderText: {
    color: colors.muted,
    fontSize: 12,
  },
  mainCard: {
    gap: 10,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  titleText: {
    flex: 1,
  },
  species: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 26,
  },
  date: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
  },
  description: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  sourceLink: {
    alignSelf: 'flex-start',
  },
  sourceLinkPressed: {
    opacity: 0.6,
  },
  sourceText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  sectionCard: {
    gap: 12,
  },
  topList: {
    gap: 10,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rankText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    width: 18,
  },
  topContent: {
    flex: 1,
    gap: 5,
  },
  topLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  topSpecies: {
    color: colors.text,
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  topScore: {
    color: colors.muted,
    fontSize: 11,
  },
  barTrack: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 2,
    flexDirection: 'row',
    height: 5,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  infoList: {
    gap: 0,
  },
  infoRow: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
})
