import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRoundState, HistoryEntry, HoleStat } from '../state/useRoundState';
import BackButton from '../components/BackButton';
import StatsTrendChart, { TrendPoint } from '../components/StatsTrendChart';

function formatDate(ms: number): string {
  if (!ms) return 'Unknown date';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatPct(value: number | null): string {
  return value == null ? '\u2014' : `${Math.round(value * 100)}%`;
}

function formatCount(value: number | null): string {
  return value == null ? '\u2014' : value.toFixed(1);
}

// One round's fairway/green/putts line, derived from that round's
// per-hole HoleStat entries. Every field is null (rather than 0) when the
// round has nothing tracked for it, so a partially-logged round never
// silently drags down an average with a fake zero.
interface RoundGolfStats {
  date: number;
  firPct: number | null;
  girPct: number | null;
  // Sum of putts across this round's tracked holes - for a round tracked
  // hole by hole start to finish, this is literally that round's putt
  // total, not a per-hole average.
  puttsInRound: number | null;
  puttsPerGir: number | null;
}

function computeRoundStats(entry: HistoryEntry): RoundGolfStats {
  const stats = Object.values(entry.holeStats ?? {});

  const firTracked = stats.filter((s) => s.fairway != null);
  const firPct = firTracked.length > 0 ? firTracked.filter((s) => s.fairway === 'hit').length / firTracked.length : null;

  // GIR only means anything once putts are known (it's derived from them),
  // so a hole with fairway logged but putts still blank doesn't count here.
  const puttsTracked = stats.filter((s): s is HoleStat & { putts: number } => s.putts != null);
  const girPct = puttsTracked.length > 0 ? puttsTracked.filter((s) => s.gir).length / puttsTracked.length : null;
  const puttsInRound =
    puttsTracked.length > 0 ? puttsTracked.reduce((sum, s) => sum + s.putts, 0) : null;

  const girHoles = puttsTracked.filter((s) => s.gir);
  const puttsPerGir = girHoles.length > 0 ? girHoles.reduce((sum, s) => sum + s.putts, 0) / girHoles.length : null;

  return { date: entry.date, firPct, girPct, puttsInRound, puttsPerGir };
}

interface CareerGolfStats {
  roundsTracked: number;
  firPct: number | null;
  girPct: number | null;
  puttsPerRound: number | null;
  puttsPerGir: number | null;
}

function computeCareerGolfStats(history: HistoryEntry[]): CareerGolfStats {
  // Career FIR%/GIR% are weighted by hole, not by round - pooling every
  // tracked hole across every round rather than averaging each round's own
  // percentage keeps a round with only a couple of holes logged from
  // counting as much as a fully-tracked one.
  const allStats = history.flatMap((entry) => Object.values(entry.holeStats ?? {}));

  const firTracked = allStats.filter((s) => s.fairway != null);
  const firPct = firTracked.length > 0 ? firTracked.filter((s) => s.fairway === 'hit').length / firTracked.length : null;

  const puttsTracked = allStats.filter((s): s is HoleStat & { putts: number } => s.putts != null);
  const girPct = puttsTracked.length > 0 ? puttsTracked.filter((s) => s.gir).length / puttsTracked.length : null;

  const girHoles = puttsTracked.filter((s) => s.gir);
  const puttsPerGir = girHoles.length > 0 ? girHoles.reduce((sum, s) => sum + s.putts, 0) / girHoles.length : null;

  const roundPuttTotals = history
    .map((entry) => computeRoundStats(entry).puttsInRound)
    .filter((v): v is number => v != null);
  const puttsPerRound =
    roundPuttTotals.length > 0 ? roundPuttTotals.reduce((sum, v) => sum + v, 0) / roundPuttTotals.length : null;

  const roundsTracked = history.filter((entry) => Object.keys(entry.holeStats ?? {}).length > 0).length;

  return { roundsTracked, firPct, girPct, puttsPerRound, puttsPerGir };
}

type StatMetric = 'fir' | 'gir' | 'puttsRound' | 'puttsGir';

const METRIC_OPTIONS: { key: StatMetric; label: string }[] = [
  { key: 'fir', label: 'FIR%' },
  { key: 'gir', label: 'GIR%' },
  { key: 'puttsRound', label: 'Putts/Rd' },
  { key: 'puttsGir', label: 'Putts/GIR' },
];

function trendPointsFor(history: HistoryEntry[], metric: StatMetric): TrendPoint[] {
  const sorted = [...history].sort((a, b) => a.date - b.date);
  const points: TrendPoint[] = [];
  for (const entry of sorted) {
    const roundStats = computeRoundStats(entry);
    let value: number | null;
    switch (metric) {
      case 'fir':
        value = roundStats.firPct != null ? roundStats.firPct * 100 : null;
        break;
      case 'gir':
        value = roundStats.girPct != null ? roundStats.girPct * 100 : null;
        break;
      case 'puttsRound':
        value = roundStats.puttsInRound;
        break;
      case 'puttsGir':
        value = roundStats.puttsPerGir;
        break;
    }
    if (value != null) points.push({ label: formatDate(entry.date), value });
  }
  return points;
}

function formatTrendValue(metric: StatMetric, value: number): string {
  return metric === 'fir' || metric === 'gir' ? `${Math.round(value)}%` : value.toFixed(1);
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface MyStatsScreenProps {
  onBack: () => void;
}

export default function MyStatsScreen({ onBack }: MyStatsScreenProps) {
  const history = useRoundState((state) => state.history);
  const loadHistory = useRoundState((state) => state.loadHistory);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<StatMetric>('gir');

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

  const career = useMemo(() => computeCareerGolfStats(history), [history]);
  const trendPoints = useMemo(() => trendPointsFor(history, metric), [history, metric]);
  const selectedOption = METRIC_OPTIONS.find((option) => option.key === metric)!;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>My Stats</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a7f37" />
        </View>
      ) : career.roundsTracked === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>
            No fairway/putts stats logged yet - log them right on the score screen as you play and
            they'll show up here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <StatBlock label="Fairways Hit" value={formatPct(career.firPct)} />
              <StatBlock label="Greens in Reg" value={formatPct(career.girPct)} />
            </View>
            <View style={styles.statsRow}>
              <StatBlock label="Putts / Round" value={formatCount(career.puttsPerRound)} />
              <StatBlock label="Putts / GIR" value={formatCount(career.puttsPerGir)} />
            </View>
            <Text style={styles.roundsTrackedNote}>
              From {career.roundsTracked} round{career.roundsTracked === 1 ? '' : 's'} with stats logged
            </Text>
          </View>

          <View style={styles.trendCard}>
            <View style={styles.metricPicker}>
              {METRIC_OPTIONS.map((option) => {
                const isActive = option.key === metric;
                return (
                  <Pressable
                    key={option.key}
                    style={[styles.metricPill, isActive && styles.metricPillActive]}
                    onPress={() => setMetric(option.key)}
                    hitSlop={4}
                  >
                    <Text style={[styles.metricPillText, isActive && styles.metricPillTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <StatsTrendChart
              points={trendPoints}
              formatValue={(value) => formatTrendValue(metric, value)}
              emptyLabel={`No ${selectedOption.label} data yet`}
            />
          </View>
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
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBlock: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 6,
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
  roundsTrackedNote: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7ea',
    fontSize: 12,
    color: '#567',
    textAlign: 'center',
  },
  trendCard: {
    backgroundColor: '#f7f8fa',
    borderRadius: 10,
    padding: 16,
  },
  metricPicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricPill: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#eceef1',
    alignItems: 'center',
  },
  metricPillActive: {
    backgroundColor: '#1a7f37',
  },
  metricPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#445',
  },
  metricPillTextActive: {
    color: '#fff',
  },
});
