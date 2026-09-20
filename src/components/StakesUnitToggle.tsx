import { Pressable, Text, StyleSheet } from 'react-native';
import { StakesUnit, stakesSymbol } from '../state/useRoundState';

interface StakesUnitToggleProps {
  unit: StakesUnit;
  onChange: (unit: StakesUnit) => void;
}

// A small tappable pill that flips a single bet (or Nassau/Match Play as a
// whole) between money and drinks - meant to sit right next to whatever
// it's the stakes for, e.g. a bet's name field.
export default function StakesUnitToggle({ unit, onChange }: StakesUnitToggleProps) {
  const isDrinks = unit === 'drinks';
  return (
    <Pressable
      style={[styles.pill, isDrinks && styles.pillDrinks]}
      onPress={() => onChange(isDrinks ? 'money' : 'drinks')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Stakes: ${isDrinks ? 'drinks' : 'money'} - tap to switch`}
    >
      <Text style={styles.pillText}>{stakesSymbol(unit)} {isDrinks ? 'Drinks' : 'Money'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: '#eef2f5',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  pillDrinks: {
    backgroundColor: '#fdf0da',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#556',
  },
});
