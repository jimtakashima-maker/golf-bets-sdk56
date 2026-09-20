import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Player, PlayerHandicaps, strokesReceivedOnHole } from '../state/useRoundState';

interface ScoreEntryProps {
  players: Player[];
  currentHole: number;
  scores: Record<string, number> | undefined;
  par: number;
  adjustedHandicaps: PlayerHandicaps;
  strokeIndex: number;
  onEnterScore: (playerId: string, strokes: number) => void;
}

export default function ScoreEntry({
  players,
  currentHole,
  scores,
  par,
  adjustedHandicaps,
  strokeIndex,
  onEnterScore,
}: ScoreEntryProps) {
  const anyStrokesGiven = players.some(
    (player) => strokesReceivedOnHole(adjustedHandicaps[player.id] ?? 0, strokeIndex) > 0
  );
  if (players.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Scores - Hole {currentHole}</Text>
        <Text style={styles.hint}>Add players to start entering scores</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scores - Hole {currentHole}</Text>
      {anyStrokesGiven && (
        <Text style={styles.strokeHint}>{'\u25cf'} marks a player who gets a stroke this hole</Text>
      )}
      {players.map((player) => (
        <ScoreRow
          key={player.id}
          player={player}
          value={scores?.[player.id]}
          par={par}
          strokes={strokesReceivedOnHole(adjustedHandicaps[player.id] ?? 0, strokeIndex)}
          onEnterScore={onEnterScore}
        />
      ))}
    </View>
  );
}

interface ScoreRowProps {
  player: Player;
  value: number | undefined;
  par: number;
  strokes: number;
  onEnterScore: (playerId: string, strokes: number) => void;
}

const MIN_STROKES = 1;
const MAX_STROKES = 15;

function ScoreRow({ player, value, par, strokes, onEnterScore }: ScoreRowProps) {
  const hasValue = value != null;
  // Before a score is entered, the stepper starts anchored on par - the
  // first +/- tap commits par plus or minus one, not MIN_STROKES.
  const effectiveValue = hasValue ? value : par;

  const decrement = () => {
    if (effectiveValue > MIN_STROKES) onEnterScore(player.id, effectiveValue - 1);
  };

  const increment = () => {
    if (effectiveValue < MAX_STROKES) onEnterScore(player.id, effectiveValue + 1);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.playerName}>
        {player.name}
        {strokes > 0 && <Text style={styles.strokeDots}> {'\u25cf'.repeat(strokes)}</Text>}
      </Text>
      <View style={styles.stepper}>
        <Pressable
          style={[styles.stepButton, effectiveValue <= MIN_STROKES && styles.stepButtonDisabled]}
          onPress={decrement}
          disabled={effectiveValue <= MIN_STROKES}
          hitSlop={8}
        >
          <Text style={styles.stepButtonText}>-</Text>
        </Pressable>

        <Text style={[styles.scoreValue, !hasValue && styles.scoreValuePlaceholder]}>
          {effectiveValue}
        </Text>

        <Pressable
          style={[styles.stepButton, effectiveValue >= MAX_STROKES && styles.stepButtonDisabled]}
          onPress={increment}
          disabled={effectiveValue >= MAX_STROKES}
          hitSlop={8}
        >
          <Text style={styles.stepButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    color: '#667',
  },
  strokeHint: {
    color: '#889',
    fontSize: 12,
    marginBottom: 8,
    marginTop: -4,
  },
  strokeDots: {
    color: '#2d6cdf',
    fontSize: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  playerName: {
    fontSize: 15,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a7f37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    backgroundColor: '#c7ddcd',
  },
  stepButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 22,
  },
  scoreValue: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
  },
  scoreValuePlaceholder: {
    color: '#9aa0a6',
  },
});
