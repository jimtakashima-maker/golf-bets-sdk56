import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FairwayResult, HoleStat } from '../state/useRoundState';

interface MyStatsEntryProps {
  par: number;
  stat: HoleStat | undefined;
  onChange: (fairway: FairwayResult | null, putts: number | null) => void;
}

const MIN_PUTTS = 0;
const MAX_PUTTS = 6;
const DEFAULT_PUTTS = 2;

// Fairway only applies on par 4s/5s - a par 3 is played to the green off
// the tee, so there's no fairway shot to track (see HoleStat's comment).
// GIR isn't entered here at all - it's derived from putts and this hole's
// score once both exist (see setHoleStat in useRoundState).
export default function MyStatsEntry({ par, stat, onChange }: MyStatsEntryProps) {
  const showFairway = par !== 3;
  // stat can exist with putts still null - e.g. only the fairway pill has
  // been tapped so far - so "logged" means putts specifically, not just
  // that a HoleStat object exists.
  const hasPutts = stat?.putts != null;
  const effectivePutts = hasPutts ? stat!.putts! : DEFAULT_PUTTS;

  const setFairway = (fairway: FairwayResult) => {
    // Tapping the already-selected pill clears it back to "not logged"
    // rather than being stuck once tapped.
    const nextFairway = stat?.fairway === fairway ? null : fairway;
    onChange(nextFairway, hasPutts ? stat.putts : null);
  };

  const decrementPutts = () => {
    if (effectivePutts > MIN_PUTTS) onChange(stat?.fairway ?? null, effectivePutts - 1);
  };

  const incrementPutts = () => {
    if (effectivePutts < MAX_PUTTS) onChange(stat?.fairway ?? null, effectivePutts + 1);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Stats</Text>
      <View style={styles.row}>
        {showFairway && (
          <View style={styles.fairwayGroup}>
            <Text style={styles.label}>Fairway</Text>
            <View style={styles.pillRow}>
              <Pressable
                style={[styles.pill, stat?.fairway === 'hit' && styles.pillActiveHit]}
                onPress={() => setFairway('hit')}
                hitSlop={6}
              >
                <Text style={[styles.pillText, stat?.fairway === 'hit' && styles.pillTextActive]}>Hit</Text>
              </Pressable>
              <Pressable
                style={[styles.pill, stat?.fairway === 'miss' && styles.pillActiveMiss]}
                onPress={() => setFairway('miss')}
                hitSlop={6}
              >
                <Text style={[styles.pillText, stat?.fairway === 'miss' && styles.pillTextActive]}>Miss</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.puttsGroup}>
          <Text style={styles.label}>Putts</Text>
          <View style={styles.stepper}>
            <Pressable
              style={[styles.stepButton, effectivePutts <= MIN_PUTTS && styles.stepButtonDisabled]}
              onPress={decrementPutts}
              disabled={effectivePutts <= MIN_PUTTS}
              hitSlop={8}
            >
              <Text style={styles.stepButtonText}>-</Text>
            </Pressable>

            <Text style={[styles.puttsValue, !hasPutts && styles.puttsValuePlaceholder]}>{effectivePutts}</Text>

            <Pressable
              style={[styles.stepButton, effectivePutts >= MAX_PUTTS && styles.stepButtonDisabled]}
              onPress={incrementPutts}
              disabled={effectivePutts >= MAX_PUTTS}
              hitSlop={8}
            >
              <Text style={styles.stepButtonText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: -4,
    marginBottom: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 20,
  },
  label: {
    fontSize: 11,
    color: '#889',
    marginBottom: 4,
  },
  fairwayGroup: {},
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pillActiveHit: {
    backgroundColor: '#1a7f37',
    borderColor: '#1a7f37',
  },
  pillActiveMiss: {
    backgroundColor: '#b3261e',
    borderColor: '#b3261e',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#445',
  },
  pillTextActive: {
    color: '#fff',
  },
  puttsGroup: {},
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1a7f37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    backgroundColor: '#c7ddcd',
  },
  stepButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 19,
  },
  puttsValue: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  puttsValuePlaceholder: {
    color: '#9aa0a6',
  },
});
