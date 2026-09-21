import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { NassauAmounts, PressStackingMode, StakesUnit, stakeFieldLabel } from '../state/useRoundState';
import InfoButton from './InfoButton';

interface NassauSettingsProps {
  net: boolean;
  amounts: NassauAmounts;
  onSetNet: (net: boolean) => void;
  onSetAmount: (segment: keyof NassauAmounts, amount: number) => void;
  // A 9-hole round has no back nine, and "Front"/"Overall" both mean the
  // same nine holes - so there's really only one amount to set, not three.
  totalHoles: number;
  // Whether to label these amounts in money or in drinks - defaults to
  // money for any call site that doesn't pass it.
  unit?: StakesUnit;
  // Presses are a Nassau-only concept (not Match Play), so these are only
  // passed - and only rendered - at the Nassau call site.
  autoPress?: boolean;
  pressStacking?: PressStackingMode;
  onSetAutoPress?: (enabled: boolean) => void;
  onSetPressStacking?: (mode: PressStackingMode) => void;
}

export default function NassauSettings({
  net,
  amounts,
  onSetNet,
  onSetAmount,
  totalHoles,
  unit = 'money',
  autoPress,
  pressStacking,
  onSetAutoPress,
  onSetPressStacking,
}: NassauSettingsProps) {
  const showPressSettings = onSetAutoPress != null && onSetPressStacking != null;

  return (
    <View style={styles.container}>
      <View style={styles.amountsRow}>
        {totalHoles === 9 ? (
          <AmountField
            label={stakeFieldLabel('Bet', unit)}
            value={amounts.front}
            onChange={(v) => onSetAmount('front', v)}
          />
        ) : (
          <>
            <AmountField
              label={stakeFieldLabel('Front', unit)}
              value={amounts.front}
              onChange={(v) => onSetAmount('front', v)}
            />
            <AmountField
              label={stakeFieldLabel('Back', unit)}
              value={amounts.back}
              onChange={(v) => onSetAmount('back', v)}
            />
            <AmountField
              label={stakeFieldLabel('Overall', unit)}
              value={amounts.overall}
              onChange={(v) => onSetAmount('overall', v)}
            />
          </>
        )}
      </View>

      <Pressable style={styles.netRow} onPress={() => onSetNet(!net)}>
        <View style={[styles.checkbox, net && styles.checkboxChecked]}>
          {net && <Text style={styles.checkboxMark}>{'✓'}</Text>}
        </View>
        <View style={styles.netTextWrap}>
          <View style={styles.labelRow}>
            <Text style={styles.netLabel}>Play net (uses handicap)</Text>
            <InfoButton
              title="Play Net"
              message="Net play adjusts each player's score by their handicap strokes before comparing, so scores are adjusted by handicap strokes when this is on - gross play compares raw scores with no adjustment."
            />
          </View>
        </View>
      </Pressable>

      {showPressSettings && (
        <>
          {pressStacking !== 'none' && (
            <Pressable style={styles.netRow} onPress={() => onSetAutoPress!(!autoPress)}>
              <View style={[styles.checkbox, autoPress && styles.checkboxChecked]}>
                {autoPress && <Text style={styles.checkboxMark}>{'✓'}</Text>}
              </View>
              <View style={styles.netTextWrap}>
                <View style={styles.labelRow}>
                  <Text style={styles.netLabel}>Auto-press at 2 down</Text>
                  <InfoButton
                    title="Auto-Press"
                    message="A press is a new bet that starts on top of the current one. With auto-press on, a new press starts automatically the moment a side falls 2 down - with it off, a player has to tap Press to start one during the round."
                  />
                </View>
              </View>
            </Pressable>
          )}

          <View style={styles.stackingRow}>
            <View style={styles.labelRow}>
              <Text style={styles.stackingLabel}>Press stacking</Text>
              <InfoButton
                title="Press Stacking"
                message="Controls whether presses are allowed, and whether a press can itself be pressed again. No Press turns presses off entirely for this bet - Single allows at most one press per segment - Unlimited lets presses keep stacking on top of each other as many times as it keeps happening."
              />
            </View>
            <View style={styles.stackingChips}>
              <Pressable
                style={[styles.stackingChip, pressStacking === 'none' && styles.stackingChipActive]}
                onPress={() => onSetPressStacking!('none')}
              >
                <Text
                  style={[
                    styles.stackingChipText,
                    pressStacking === 'none' && styles.stackingChipTextActive,
                  ]}
                >
                  No Press
                </Text>
              </Pressable>
              <Pressable
                style={[styles.stackingChip, pressStacking === 'single' && styles.stackingChipActive]}
                onPress={() => onSetPressStacking!('single')}
              >
                <Text
                  style={[
                    styles.stackingChipText,
                    pressStacking === 'single' && styles.stackingChipTextActive,
                  ]}
                >
                  Single
                </Text>
              </Pressable>
              <Pressable
                style={[styles.stackingChip, pressStacking === 'unlimited' && styles.stackingChipActive]}
                onPress={() => onSetPressStacking!('unlimited')}
              >
                <Text
                  style={[
                    styles.stackingChipText,
                    pressStacking === 'unlimited' && styles.stackingChipTextActive,
                  ]}
                >
                  Unlimited
                </Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

function AmountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Keeps this field in sync with amounts set from outside this input -
  // the random bet generator's setNassauAmount/setMatchPlayAmount calls
  // in particular, which used to leave whatever was already typed here on
  // screen even though the actual stored amount had changed underneath
  // it. Skipped while the field is focused so it never clobbers a value
  // being actively typed.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onChange(parsed);
      setDraft(String(parsed));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <View style={styles.amountField}>
      <Text style={styles.amountLabel}>{label}</Text>
      <TextInput
        style={styles.amountInput}
        value={draft}
        onChangeText={setDraft}
        onFocus={() => setFocused(true)}
        onEndEditing={commit}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef8f0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#1a7f37',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#1a7f37',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  netTextWrap: {
    flex: 1,
  },
  netLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#234',
  },
  amountsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  amountField: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 12,
    color: '#556',
    marginBottom: 4,
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: 'center',
    fontSize: 14,
  },
  stackingRow: {
    backgroundColor: '#f7f8fa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  stackingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#234',
    marginBottom: 8,
  },
  stackingChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  stackingChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  stackingChipActive: {
    backgroundColor: '#1a7f37',
    borderColor: '#1a7f37',
  },
  stackingChipText: {
    color: '#556',
    fontSize: 13,
    fontWeight: '600',
  },
  stackingChipTextActive: {
    color: '#fff',
  },
});
