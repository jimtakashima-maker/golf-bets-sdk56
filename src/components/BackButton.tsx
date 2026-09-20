import { Pressable, Text, StyleSheet } from 'react-native';

interface BackButtonProps {
  onPress: () => void;
  // Almost everywhere this just says "Back" - the one exception is a
  // nested admin panel reached from mid-round (Game Admin), where naming
  // the destination ("Back to Round") actually helps, since that screen
  // otherwise gives no clue what tapping it returns you to.
  label?: string;
  disabled?: boolean;
}

// The one back-navigation control used across the whole app, so every
// screen's "go back" link looks and reads the same way instead of each
// screen styling its own (previously: two different weights, two different
// spacings, and a couple of screens skipping the chevron entirely).
export default function BackButton({ onPress, label = 'Back', disabled }: BackButtonProps) {
  return (
    <Pressable onPress={onPress} hitSlop={8} disabled={disabled}>
      <Text style={[styles.text, disabled && styles.disabled]}>{'\u2039'} {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    color: '#1a7f37',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 24,
  },
  disabled: {
    opacity: 0.6,
  },
});
