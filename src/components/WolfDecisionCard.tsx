import { View, Text, StyleSheet, Pressable } from 'react-native';
import { WolfBet, WolfDecision, Player } from '../state/useRoundState';

interface WolfDecisionCardProps {
  bet: WolfBet;
  decision: WolfDecision | undefined;
  allPlayers: Player[];
  currentHole: number;
  onSetDecision: (partnerId: string | null) => void;
  onClearDecision: () => void;
}

// Lives on the Score tab, one card per Wolf bet whose whole roster is in
// the tee group currently being scored (see ScoreScreen's activeGroupWolfBets)
// - a bet split across tee groups couldn't rotate Wolf through everyone on
// one scoring device anyway. Shows whose turn it is to be Wolf this hole
// (wolfIndex wraps through bet.playerIds the same way computeWolfForBet
// does) and lets that hole's decision - a partner, or Lone Wolf - be made
// once and changed until the round moves on. A hole with no decision yet
// just shows unresolved on the Leaderboard/Settlement side (see
// computeWolfForBet) rather than blocking score entry - Wolf's own money
// can lag behind the scorecard without holding anything else up.
export default function WolfDecisionCard({
  bet,
  decision,
  allPlayers,
  currentHole,
  onSetDecision,
  onClearDecision,
}: WolfDecisionCardProps) {
  const nameById = (id: string) => allPlayers.find((player) => player.id === id)?.name ?? 'Player';

  const wolfIndex = (currentHole - 1) % bet.playerIds.length;
  const wolfPlayerId = bet.playerIds[wolfIndex];
  const otherIds = bet.playerIds.filter((id) => id !== wolfPlayerId);

  if (!decision) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{'🐺 '}{nameById(wolfPlayerId)} is the Wolf</Text>
        <Text style={styles.subtitle}>Pick a partner, or go it alone for {bet.loneWolfMultiplier}x the hole.</Text>
        <View style={styles.chipRow}>
          {otherIds.map((id) => (
            <Pressable key={id} style={styles.chip} onPress={() => onSetDecision(id)}>
              <Text style={styles.chipText}>Partner: {nameById(id)}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, styles.loneWolfChip]} onPress={() => onSetDecision(null)}>
            <Text style={[styles.chipText, styles.loneWolfChipText]}>Lone Wolf</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const decisionText = decision.loneWolf
    ? `${nameById(wolfPlayerId)} went Lone Wolf this hole`
    : `${nameById(wolfPlayerId)} partnered with ${nameById(decision.partnerId ?? '')}`;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{'🐺 '}{bet.name}</Text>
      <View style={styles.decidedRow}>
        <Text style={styles.decidedText}>{decisionText}</Text>
        <Pressable style={styles.changeButton} onPress={onClearDecision}>
          <Text style={styles.changeButtonText}>Change</Text>
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
    borderLeftColor: '#b8862f',
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#889',
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#445',
  },
  loneWolfChip: {
    backgroundColor: '#b8862f',
    borderColor: '#b8862f',
  },
  loneWolfChipText: {
    color: '#fff',
  },
  decidedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  decidedText: {
    fontSize: 13,
    color: '#334',
    flex: 1,
    marginRight: 8,
  },
  changeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  changeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556',
  },
});
