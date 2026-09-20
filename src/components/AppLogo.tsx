import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface AppLogoProps {
  size?: number;
  showWordmark?: boolean;
  // Overrides the default centered, spaced-below placement used on
  // pre-round screens - e.g. a persistent in-round header, where the mark
  // sits inline at the left with no extra margin of its own.
  style?: StyleProp<ViewStyle>;
}

// The golf-ball mark that also appears as the app icon - kept as vector
// shapes here (rather than an <Image>) so it stays crisp at any size.
function BallMark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="32" fill="#1a7f37" />
      <Circle cx="32" cy="32" r="22" fill="#ffffff" />
      <Circle cx="24" cy="22" r="2.4" fill="#cfe3d6" />
      <Circle cx="34" cy="20" r="2.4" fill="#cfe3d6" />
      <Circle cx="43" cy="27" r="2.4" fill="#cfe3d6" />
      <Circle cx="21" cy="32" r="2.4" fill="#cfe3d6" />
      <Circle cx="32" cy="32" r="2.4" fill="#cfe3d6" />
      <Circle cx="43" cy="32" r="2.4" fill="#cfe3d6" />
      <Circle cx="24" cy="42" r="2.4" fill="#cfe3d6" />
      <Circle cx="34" cy="44" r="2.4" fill="#cfe3d6" />
      <Circle cx="41" cy="38" r="2.4" fill="#cfe3d6" />
    </Svg>
  );
}

// The small logo lockup shown at the top of the pre-round screens - the
// same ball mark used for the app icon, plus the wordmark. Pass
// showWordmark={false} for a mark-only placement in a tighter space.
export default function AppLogo({ size = 40, showWordmark = true, style }: AppLogoProps) {
  return (
    <View style={[styles.row, style]}>
      <BallMark size={size} />
      {showWordmark && (
        <Text style={[styles.wordmark, { fontSize: size * 0.5 }]}>Then Press Me</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16,
    gap: 10,
  },
  wordmark: {
    fontWeight: '700',
    color: '#16513a',
  },
});
