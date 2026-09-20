import { View, Text, StyleSheet } from 'react-native';
import { StrokePlayState, StrokePlayBetResult, StrokePlayPlayerTotal, Player } from '../state/useRoundState';

interface StrokePlayStatusProps {
  strokePlay: StrokePlayState;
  players: Player[];
}

function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

interface RankedTotal extends StrokePlayPlayerTotal {
  posLabel: string;
}

// Same tournament tie handling as the Leaderboard's own standings board:
// equal scores share a position label ("T2"), and the next distinct
// score resumes counting from how many players are already above it.
function assignPositions(totals: StrokePlayPlayerTotal[]): RankedTotal[] {
  const ranked: RankedTotal[] = [];
  let i = 0;
  while (i < totals.length) {
    let j = i;
    while (j + 1 < totals.length && totals[j + 1].toPar === totals[i].toPar) j += 1;
    const posLabel = j > i ? `T${i + 1}` : `${i + 1}`;
    for (let k = i; k <= j; k += 1) {
      ranked.push({ ...totals[k], posLabel });
    }
    i = j + 1;
  }
  return ranked;
}

// One Stroke Play bet's standings, ranked best to worst. `resolved` (every
// entrant has finished the round) is the only thing separating a live,
// still-moving total from the final one money actually settles on.
function StrokePlayBetCard({ bet, divider }: { bet: StrokePlayBetResult; divider: boolean }) {
  if (bet.totals.length === 0) {
    return (
      <View style={[styles.betBlock, divider && styles.betDivider]}>
        <Text style={styles.betTitle}>{bet.name}</Text>
        <Text style={styles.hint}>Add 2+ players to track this bet.</Text>
      </View>
    );
  }

  const ranked = assignPositions(bet.totals);

  return (
    <View style={[styles.betBlock, divider && styles.betDivider]}>
      <View style={styles.betTitleRow}>
        <Text style={styles.betTitle}>{bet.name}</Text>
        <Text style={styles.statusText}>{bet.resolved ? 'Final' : 'In progress'}</Text>
      </View>
      {ranked.map((total) => {
        const isUnder = total.toPar < 0;
        const isOver = total.toPar > 0;
        return (
          <View style={styles.row} key={total.id}>
            <Text style={styles.label} numberOfLines={1}>
              {total.posLabel}. {total.label}
            </Text>
            <Text style={[styles.value, isUnder && styles.valueUnder, isOver && styles.valueOver]}>
              {formatToPar(total.toPar)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function StrokePlayStatus({ strokePlay, players }: StrokePlayStatusProps) {
  if (strokePlay.length === 0) {
    const hint = players.length < 2 ? 'Add 2+ players to track Stroke Play' : 'No Stroke Play bets yet - add one in Game Admin.';
    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <Text style={styles.headerBarText}>STROKE PLAY</Text>
        </View>
        <Text style={[styles.hint, styles.content]}>{hint}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerBarText}>STROKE PLAY</Text>
      </View>
      <View style={styles.content}>
        {strokePlay.map((bet, index) => (
          <StrokePlayBetCard key={bet.betId} bet={bet} divider={index > 0} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e6ea',
  },
  headerBar: {
    backgroundColor: '#16513a',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  headerBarText: {
    color: '#dcefe3',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  content: {
    padding: 12,
  },
  hint: {
    color: '#556',
  },
  betBlock: {
    marginBottom: 4,
  },
  betDivider: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  betTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  betTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#234',
  },
  statusText: {
    fontSize: 12,
    color: '#889',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  label: {
    fontSize: 13,
    color: '#234',
    flex: 1,
    marginRight: 8,
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    color: '#445',
  },
  valueUnder: {
    color: '#1a7f37',
  },
  valueOver: {
    color: '#c0392b',
  },
});
