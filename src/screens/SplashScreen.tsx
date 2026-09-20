import { useEffect, useRef } from 'react';
import { Text, Animated, StyleSheet } from 'react-native';
import PreRoundBackground from '../components/PreRoundBackground';
import AppLogo from '../components/AppLogo';

interface SplashScreenProps {
  onDone: () => void;
  // How long to hold the splash before calling onDone - kept short since
  // this is a branding beat, not something to make anyone wait through.
  durationMs?: number;
}

// The very first thing anyone sees on app open: the logo and a one-line
// marketing message, held just long enough to register before handing off
// to the "Confirm Your Profile" gate. Purely time-based (no button to
// tap) so it never becomes an extra step someone has to clear.
export default function SplashScreen({ onDone, durationMs = 1800 }: SplashScreenProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => onDone());
    }, durationMs);

    return () => clearTimeout(timer);
  }, [opacity, onDone, durationMs]);

  return (
    <PreRoundBackground>
      <Animated.View style={[styles.container, { opacity }]}>
        <AppLogo size={72} />
        <Text style={styles.tagline}>Golf bets, settled on the spot.</Text>
        <Text style={styles.subtext}>Nassau, Skins, Stroke Play and more - track it all with your tee group.</Text>
      </Animated.View>
    </PreRoundBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  tagline: {
    fontSize: 17,
    fontWeight: '700',
    color: '#16513a',
    textAlign: 'center',
    marginTop: 8,
  },
  subtext: {
    fontSize: 14,
    color: '#556',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },
});
