import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { BirdiesState, BirdiesBetResult } from '../state/useRoundState';

interface BirdiesStatusProps {
  birdies: BirdiesState;
}

function BirdiesBetSummary({
  bet,
  divider,
  onPress,
}: {
  bet: BirdiesBetResult;
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

  return (
    <Pressable style={[styles.betBlock, divider && styles.betDivider]} onPress={onPress}>
      <Text style={styles.betTitle}>{bet.name}</Text>
      <Text style={styles.subtitle}>
        {bet.holesResolved} hole{bet.holesResolved === 1 ? '' : 's'} played
      </Text>
      {bet.totals.map((total) => (
        <View style={styles.row} key={total.id}>
          <Text style={styles.label}>{total.label}</Text>
          <Text style={styles.value}>
            {total.points} pt{total.points === 1 ? '' : 's'}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

// Read-only hole-by-hole detail for one Birdies bet - every eligible
// player's score on every hole, with any birdie-or-better cell
// highlighted (and a "+N" badge for an eagle or better, worth more than
// one point).
function BirdiesBetDetailModal({
  visible,
  bet,
  onClose,
}: {
  visible: boolean;
  bet: BirdiesBetResult | null;
  onClose: () => void;
}) {
  if (!bet) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={detailStyles.backdrop} onPress={onClose} />
      <View style={detailStyles.sheet}>
        <Text style={detailStyles.title}>{bet.name}</Text>
        <Text style={detailStyles.subtitle}>Read-only - birdies and better highlighted</Text>

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
                    const points = h.scorers[total.id] ?? 0;
                    const scored = points > 0;
                    return (
                      <View key={h.hole} style={[detailStyles.gridCell, scored && detailStyles.winCell]}>
                        <Text style={[detailStyles.scoreText, scored && detailStyles.winText]}>
                          {h.scores[total.id] ?? '-'}
                        </Text>
                        {points > 1 && <Text style={detailStyles.badgeText}>+{points}</Text>}
                      </View>
                    );
                  })}
                </View>
              ))}
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

export default function BirdiesStatus({ birdies }: BirdiesStatusProps) {
  const [selected, setSelected] = useState<BirdiesBetResult | null>(null);

  // Once the round is under way, an empty Birdies section is just noise -
  // nobody set up a Birdies bet for this round, so there's nothing to
  // show, matching how Skins/Match Play/Stroke Play behave here.
  if (birdies.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerBarText}>BIRDIES</Text>
      </View>
      <View style={styles.content}>
        {birdies.map((bet, index) => (
          <BirdiesBetSummary
            key={bet.betId}
            bet={bet}
            divider={index > 0}
            onPress={() => setSelected(bet)}
          />
        ))}
      </View>

      <BirdiesBetDetailModal visible={selected !== null} bet={selected} onClose={() => setSelected(null)} />
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
    backgroundColor: '#e2f3e6',
  },
  winText: {
    color: '#1a7f37',
    fontWeight: '700',
  },
  badgeText: {
    position: 'absolute',
    top: 1,
    right: 1,
    fontSize: 8,
    fontWeight: '700',
    color: '#1a7f37',
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
