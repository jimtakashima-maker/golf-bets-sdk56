import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal } from 'react-native';
import { useRoundState } from '../state/useRoundState';

interface SmackTalkSenderProps {
  visible: boolean;
  onClose: () => void;
}

const MAX_LENGTH = 40;

// Caddyshack-adjacent one-liners for a quick tap, no typing required -
// "Cinderella story" is the Carl Spackler line this whole feature got
// tested with, so it stays in the list.
const PRESETS = [
  'Cinderella story',
  'Be the ball',
  "You're gonna eat it",
  "That'll play",
  'Nice shank',
  'Skins, baby!',
  "Gimme? Never heard of her",
  'Mulligan for the highlight reel',
];

// Sends a sticker that pops up full-screen on every other device in the
// round (see sendSmackTalk in useRoundState and SmackTalkOverlay for the
// receiving side) - never shown back to the sender.
export default function SmackTalkSender({ visible, onClose }: SmackTalkSenderProps) {
  const sendSmackTalk = useRoundState((state) => state.sendSmackTalk);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleClose = () => {
    setText('');
    onClose();
  };

  const send = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await sendSmackTalk(trimmed);
      setText('');
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Talk Trash</Text>
        <Text style={styles.subtitle}>
          Pops up full-screen on every other player's phone for a few seconds.
        </Text>

        <View style={styles.presetGrid}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset}
              style={styles.presetChip}
              onPress={() => send(preset)}
              disabled={sending}
            >
              <Text style={styles.presetChipText}>{preset}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.customRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Or type your own..."
            maxLength={MAX_LENGTH}
            onSubmitEditing={() => send(text)}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable
            style={[styles.sendButton, (!text.trim() || sending) && styles.buttonDisabled]}
            onPress={() => send(text)}
            disabled={!text.trim() || sending}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>

        <Pressable style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#889',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  presetChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#445',
  },
  customRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    backgroundColor: '#1a7f37',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    color: '#556',
    fontWeight: '600',
  },
});
