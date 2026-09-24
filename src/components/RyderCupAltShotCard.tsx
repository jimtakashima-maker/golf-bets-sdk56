import { View, Text, StyleSheet, Pressable } from 'react-native';
import { RyderCupBet, RyderCupPairMatch, Player, ryderCupAltShotFormatLabel } from '../state/useRoundState';

interface RyderCupAltShotCardProps {
  bet: RyderCupBet;
  match: RyderCupPairMatch;
  scoresA: Record<number, number> | undefined;
  scoresB: Record<number, number> | undefined;
  allPlayers: Player[];
  currentHole: number;
  par: number;
  onEnterScore: (side: 'A' | 'B', strokes: number) => void;
}

const MIN_STROKES = 1;
const MAX_STROKES = 15;

// Lives on the Score tab during holes 7-12 (RYDER_CUP_SEGMENT_HOLES.altShot),
// one card per Modified Alternate Shot match whose foursome is entirely in
// the tee group currently being scored - mirrors WolfDecisionCard/Nassau's
// activeGroupMatchups reasoning (see ScoreScreen's
// activeGroupRyderCupAltShotMatches), filtered match by match rather than
// whole-bet since a single Ryder Cup bet can span far more players than
// fit in one tee group under "support bigger groups." Alternate shot is
// one ball per team, so each side gets a single shared score per hole -
// entered here with the same par-anchored stepper every other score uses
// - rather than the per-player scorecard every other bet type reads from
// (see RyderCupBet's own comment and setAltShotScore).
export default function RyderCupAltShotCard({
  bet,
  match,
  scoresA,
  scoresB,
  allPlayers,
  currentHole,
  par,
  onEnterScore,
}: RyderCupAltShotCardProps) {
  const nameById = (id: string) => allPlayers.find((player) => player.id === id)?.name ?? 'Player';

  const teamALabel = `${nameById(match.teamAPlayerIds[0])} & ${nameById(match.teamAPlayerIds[1])}`;
  const teamBLabel = `${nameById(match.teamBPlayerIds[0])} & ${nameById(match.teamBPlayerIds[1])}`;
  const formatLabel = ryderCupAltShotFormatLabel(bet.altShotFormat);

  const valueA = scoresA?.[currentHole];
  const valueB = scoresB?.[currentHole];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{'⛳ '}{bet.name} - {formatLabel}</Text>
      <AltShotStepperRow
        teamLabel={bet.teamAName}
        pairLabel={teamALabel}
        value={valueA}
        par={par}
        onEnterScore={(strokes) => onEnterScore('A', strokes)}
      />
      <AltShotStepperRow
        teamLabel={bet.teamBName}
        pairLabel={teamBLabel}
        value={valueB}
        par={par}
        onEnterScore={(strokes) => onEnterScore('B', strokes)}
      />
    </View>
  );
}

interface AltShotStepperRowProps {
  teamLabel: string;
  pairLabel: string;
  value: number | undefined;
  par: number;
  onEnterScore: (strokes: number) => void;
}

function AltShotStepperRow({ teamLabel, pairLabel, value, par, onEnterScore }: AltShotStepperRowProps) {
  const hasValue = value != null;
  // Same par-anchored stepper as ScoreEntry's ScoreRow - the first +/-
  // tap commits par plus or minus one, not MIN_STROKES.
  const effectiveValue = hasValue ? value : par;

  const decrement = () => {
    if (effectiveValue > MIN_STROKES) onEnterScore(effectiveValue - 1);
  };

  const increment = () => {
    if (effectiveValue < MAX_STROKES) onEnterScore(effectiveValue + 1);
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowLabels}>
        <Text style={styles.teamLabel}>{teamLabel}</Text>
        <Text style={styles.pairLabel}>{pairLabel}</Text>
      </View>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#2d6cdf',
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabels: {
    flex: 1,
    marginRight: 8,
  },
  teamLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#223',
  },
  pairLabel: {
    fontSize: 12,
    color: '#889',
    marginTop: 1,
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
