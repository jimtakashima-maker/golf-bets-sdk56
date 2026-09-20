import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Modal, ActivityIndicator, Alert } from 'react-native';
import { useRoundState } from '../state/useRoundState';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
}

// A single, low-friction way for anyone testing the app to send a thought
// back - what's confusing, what broke, what they'd want next. Only the
// developer's own profile can ever read these back (see AdminScreen and
// database.rules.json's "feedback" node) - everyone can write one, nobody
// but that profile can read the list.
export default function FeedbackModal({ visible, onClose }: FeedbackModalProps) {
  const submitFeedback = useRoundState((state) => state.submitFeedback);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleClose = () => {
    setText('');
    onClose();
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await submitFeedback(text);
      setText('');
      onClose();
      Alert.alert('Thanks!', 'Your feedback was sent.');
    } catch (error) {
      Alert.alert("Couldn't send that", (error as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Send Feedback</Text>
        <Text style={styles.subtitle}>What's confusing, broken, or missing? Only the developer sees this.</Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Type your feedback..."
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
        <Pressable
          style={[styles.sendButton, (!text.trim() || sending) && styles.buttonDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>Send</Text>}
        </Pressable>
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
    marginBottom: 12,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 14,
  },
  sendButton: {
    backgroundColor: '#1a7f37',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
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
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    color: '#556',
    fontWeight: '600',
  },
});
