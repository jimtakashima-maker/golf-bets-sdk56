import { useEffect, useRef } from 'react';
import { Modal, Pressable, Text, Animated, StyleSheet } from 'react-native';
import { useRoundState } from '../state/useRoundState';

const AUTO_DISMISS_MS = 3500;

// Mounted once, globally (see App.tsx) so a sticker pops up over whatever
// screen a player happens to be looking at, not just the score screen -
// this component doesn't live inside any one screen's own render tree.
export default function SmackTalkOverlay() {
  const incoming = useRoundState((state) => state.incomingSmackTalk);
  const clearSmackTalk = useRoundState((state) => state.clearSmackTalk);
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (!incoming) return;
    scale.setValue(0.5);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    const timer = setTimeout(clearSmackTalk, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [incoming, scale, clearSmackTalk]);

  if (!incoming) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={clearSmackTalk}>
      <Pressable style={styles.backdrop} onPress={clearSmackTalk}>
        <Animated.View style={[styles.sticker, { transform: [{ scale }, { rotate: '-4deg' }] }]}>
          <Text style={styles.senderTag} numberOfLines={1}>
            {incoming.senderName.toUpperCase()} SAYS
          </Text>
          <Text style={styles.text}>{incoming.text}</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  sticker: {
    backgroundColor: '#fff',
    borderWidth: 5,
    borderColor: '#c0392b',
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  senderTag: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#c0392b',
    marginBottom: 8,
  },
  text: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
  },
});
