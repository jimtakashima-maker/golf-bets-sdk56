import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { SkinsState, SkinsBetResult } from '../state/useRoundState';

interface SkinsStatusProps {
  skins: SkinsState;
}

function SkinsBetSummary({
  bet,
  divider,
  onPress,
}: {
  bet: SkinsBetResult;
  divider: boolean;
  onPress: () => void;
}) {
  if (bet.totals.length === 0) {
    return (
      <View style={[styles.betBlock, divider && styles.betDivider]}>
        <Text style={styles.betTitle}>{bet.name}</Text>
        <Text style={styles.hint}>Add 2+ players to track this bet.</Text>
      </View>
    );
  }

  const carryHint =
    bet.carryover && bet.pendingSkins > 0
      ? ` - ${bet.pendingSkins} skin${bet.pendingSkins === 1 ? '' : 's'} riding on the next hole`
      : '';

  return (
    <Pressable style={[styles.betBlock, divider && styles.betDivider]} onPress={onPress}>
      <Text style={styles.betTitle}>{bet.name}</Text>
      <Text style={styles.subtitle}>
        {bet.holesResolved} hole{bet.holesResolved === 1 ? '' : 's'} played{carryHint}
      </Text>
      {bet.totals.map((total) => (
        <View style={styles.row} key={total.id}>
          <Text style={styles.label}>{total.label}</Text>
          <Text style={styles.value}>
            {total.skinsWon} skin{total.skinsWon === 1 ? '' : 's'}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

// Read-only hole-by-hole detail for one Skins bet - every eligible
// player's score on every hole, with the hole's winning cell highlighted
// (and a "+N" badge when carried-in skins are paid out on it). A tied
// hole is flagged as carrying or lost, per the bet's own carryover rule,
// instead of highlighting anyone.
function SkinsBetDetailModal({
  visible,
  bet,
  onClose,
}: {
  visible: boolean;
  bet: SkinsBetResult | null;
  onClose: () => void;
}) {
  if (!bet) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={detailStyles.backdrop} onPress={onClose} />
      <View style={detailStyles.sheet}>
        <Text style={detailStyles.title}>{bet.name}</Text>
        <Text style={detailStyles.subtitle}>Read-only - skin wins highlighted</Text>

        <View style={detailStyles.grid}>
          <View style={detailStyles.stickyCol}>
            <View style={detailStyles.cell}>
              <Text style={detailStyles.stickyHeaderText}>Hole</Text>
            </View>
            {bet.totals.map((total) => (
              <View style={detailStyles.cell} key={total.id}>
                <Text style={detailStyles.stickyText} numberOfLines={1}>
                  {total.label}
                </Text>
              </View>
            ))}
            <View style={detailStyles.cell}>
              <Text style={detailStyles.stickyHeaderText}>{' '}</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={detailStyles.row}>
                {bet.holes.map((h) => (
                  <View style={detailStyles.gridCell} key={h.hole}>
                    <Text style={detailStyles.headerText}>{h.hole}</Text>
                  </View>
                ))}
              </View>

              {bet.totals.map((total) => (
                <View style={detailStyles.row} key={total.id}>
                  {bet.holes.map((h) => {
                    const isWinner = h.winnerId === total.id;
                    return (
                      <View key={h.hole} style={[detailStyles.gridCell, isWinner && detailStyles.winCell]}>
                        <Text style={[detailStyles.scoreText, isWinner && detailStyles.winText]}>
                          {h.scores[total.id] ?? '-'}
                        </Text>
                        {isWinner && h.skinsAwarded > 1 && (
                          <Text style={detailStyles.badgeText}>+{h.skinsAwarded}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}

              <View style={detailStyles.row}>
                {bet.holes.map((h) => (
                  <View style={detailStyles.gridCell} key={h.hole}>
                    <Text style={detailStyles.tagText}>
                      {h.tied ? (bet.carryover ? 'Carry' : 'Tied') : ''}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>

        <Pressable style={detailStyles.closeButton} onPress={onClose}>
          <Text style={detailStyles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export default function SkinsStatus({ skins }: SkinsStatusProps) {
  const [selected, setSelected] = useState<SkinsBetResult | null>(null);

  // Once the round is under way, an empty Skins section is just noise -
  // nobody set up a Skins bet for this round, so there's nothing to show.
  // (The "add one in Game Admin" nudge this used to show here belongs in
  // Game Admin, where bets are actually configured, not on the read-only
  // Leaderboard.)
  if (skins.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerBarText}>SKINS</Text>
      </View>
      <View style={styles.content}>
        {skins.map((bet, index) => (
          <SkinsBetSummary
            key={bet.betId}
            bet={bet}
            divider={index > 0}
            onPress={() => setSelected(bet)}
          />
        ))}
      </View>

      <SkinsBetDetailModal visible={selected !== null} bet={selected} onClose={() => setSelected(null)} />
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
    borderTopColor: '#f0dfb8',
  },
  betTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#234',
    marginBottom: 2,
  },
  subtitle: {
    color: '#886a2a',
    fontSize: 12,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontWeight: '500',
  },
  value: {
    color: '#234',
  },
});

const detailStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: '#889',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
  },
  stickyCol: {
    width: 88,
  },
  cell: {
    height: 36,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stickyHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
  },
  stickyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  row: {
    flexDirection: 'row',
  },
  gridCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderLeftWidth: 1,
    borderLeftColor: '#f3f3f3',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  winCell: {
    backgroundColor: '#fdf3d9',
  },
  winText: {
    color: '#a8760f',
    fontWeight: '700',
  },
  badgeText: {
    position: 'absolute',
    top: 1,
    right: 1,
    fontSize: 8,
    fontWeight: '700',
    color: '#a8760f',
  },
  tagText: {
    fontSize: 9,
    color: '#889',
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    color: '#556',
    fontWeight: '600',
  },
});
