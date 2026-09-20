import { View, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import AngryGolferArt from './AngryGolferArt';

interface PreRoundBackgroundProps {
  children: ReactNode;
}

// A quiet watermark shown behind every screen before a round actually
// gets going - Welcome, Join, Start (including the post-create screen),
// Course Setup, and the opening profile confirmation. Once Game Options
// begins the app is all business, so this stops there. Faint and
// pointer-events-none so it never competes with or blocks real content.
export default function PreRoundBackground({ children }: PreRoundBackgroundProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.art} pointerEvents="none">
        <AngryGolferArt size={280} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  art: {
    position: 'absolute',
    right: -20,
    bottom: 10,
    // 0.07 turned out to be too faint to register on a phone screen -
    // this is still meant to read as a watermark, not real content, but
    // it should actually be visible without staring at the screen.
    opacity: 0.18,
  },
});
