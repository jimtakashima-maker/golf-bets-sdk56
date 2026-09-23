import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRoundState, HistoryEntry } from '../state/useRoundState';
import BackButton from '../components/BackButton';

function formatAmount(amount: number): string {
  const rounded = Math.abs(Math.round(amount * 100) / 100);
  return `$${rounded.toFixed(2)}`;
}

function formatSigned(amount: number): string {
  if (amount === 0) return formatAmount(0);
  return amount > 0 ? `+${formatAmount(amount)}` : `-${formatAmount(amount)}`;
}

function formatDate(ms: number): string {
  if (!ms) return 'Unknown date';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface CareerStats {
  roundsPlayed: number;
  careerNet: number;
  wins: number;
  losses: number;
  // null rather than 0% when nobody's ever finished up or down - "0% wins"
  // reads very differently from "no decisive rounds yet."
  winRate: number | null;
  bestCategory: { category: string; amount: number } | null;
  worstCategory: { category: string; amount: number } | null;
}

function computeCareerStats(history: HistoryEntry[]): CareerStats {
  const roundsPlayed = history.length;
  const careerNet = history.reduce((sum, entry) => sum + entry.amount, 0);
  const wins = history.filter((entry) => entry.amount > 0).length;
  const losses = history.filter((entry) => entry.amount < 0).length;
  const decisive = wins + losses;
  const winRate = decisive > 0 ? wins / decisive : null;

  const byCategory = new Map<string, number>();
  for (const entry of history) {
    for (const item of entry.breakdown) {
      byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amount);
    }
  }
  let bestCategory: { category: string; amount: number } | null = null;
  let worstCategory: { category: string; amount: number } | null = null;
  for (const [category, amount] of byCategory) {
    if (!bestCategory || amount > bestCategory.amount) bestCategory = { category, amount };
    if (!worstCategory || amount < worstCategory.amount) worstCategory = { category, amount };
  }

  return { roundsPlayed, careerNet, wins, losses, winRate, bestCategory, worstCategory };
}

function StatBlock({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object }) {
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, valueStyle]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface MyHistoryScreenProps {
  onBack: () => void;
  onViewRound: (roundCode: string) => void;
}

export default function MyHistoryScreen({ onBack, onViewRound }: MyHistoryScreenProps) {
  const history = useRoundState((state) => state.history);
  const loadHistory = useRoundState((state) => state.loadHistory);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadHistory().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadHistory]);

  const stats = useMemo(() => computeCareerStats(history), [history]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>My History</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a7f37" />
        </View>
      ) : history.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>
            No rounds recorded yet - a round shows up here once you've joined it from your own
            phone and its bets are all closed.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <StatBlock
                label="Career Net"
                value={formatSigned(stats.careerNet)}
                valueStyle={stats.careerNet > 0 ? styles.owedText : stats.careerNet < 0 ? styles.owesText : undefined}
              />
              <StatBlock label="Rounds" value={String(stats.roundsPlayed)} />
              <StatBlock label="Win Rate" value={stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`} />
            </View>
            {(stats.bestCategory || stats.worstCategory) && (
              <View style={styles.statsSecondRow}>
                {stats.bestCategory && (
                  <Text style={styles.statsNote}>
                    Best bet: {stats.bestCategory.category} ({formatSigned(stats.bestCategory.amount)})
                  </Text>
                )}
                {stats.worstCategory && (
                  <Text style={styles.statsNote}>
                    Worst bet: {stats.worstCategory.category} ({formatSigned(stats.worstCategory.amount)})
                  </Text>
                )}
              </View>
            )}
          </View>

          {history.map((entry) => (
            <Pressable key={entry.roundCode} style={styles.row} onPress={() => onViewRound(entry.roundCode)}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowCourse} numberOfLines={1}>
                  {entry.courseName ?? 'Round'}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {formatDate(entry.date)} · {entry.totalHoles} holes
                  {entry.opponentNames.length > 0 ? ` · vs ${entry.opponentNames.join(', ')}` : ''}
                </Text>
              </View>
              <Text
                style={[
                  styles.rowAmount,
                  entry.amount > 0 ? styles.owedText : entry.amount < 0 ? styles.owesText : styles.evenAmountText,
                ]}
              >
                {entry.amount === 0 ? 'Even' : formatSigned(entry.amount)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 8,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  empty: {
    color: '#889',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  statsCard: {
    backgroundColor: '#f7f8fa',
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBlock: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#234',
  },
  statLabel: {
    fontSize: 11,
    color: '#889',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsSecondRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7ea',
  },
  statsNote: {
    fontSize: 12,
    color: '#567',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  rowLeft: {
    flex: 1,
    paddingRight: 10,
  },
  rowCourse: {
    fontSize: 15,
    fontWeight: '600',
    color: '#234',
  },
  rowMeta: {
    fontSize: 12,
    color: '#889',
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  owedText: {
    color: '#1a7f37',
  },
  owesText: {
    color: '#c0392b',
  },
  evenAmountText: {
    color: '#889',
  },
});

