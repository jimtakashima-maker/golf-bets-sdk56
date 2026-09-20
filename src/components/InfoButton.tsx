import { useState } from 'react';
import { Modal, Pressable, Text, StyleSheet } from 'react-native';

interface InfoButtonProps {
  // What the bubble explains - shown as its title line, e.g. "Display Name".
  title: string;
  // The explanation itself.
  message: string;
}

// A small (i) button that pops a short explanation in a message bubble -
// used next to a field label in place of a permanent line of hint text, so
// the label row stays compact and the explanation is there for whoever
// wants it, out of the way for whoever doesn't.
export default function InfoButton({ title, message }: InfoButtonProps) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        hitSlop={10}
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel={`About ${title}`}
      >
        <Text style={styles.buttonText}>{'ⓘ'}</Text>
      </Pressable>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.bubble} onPress={() => {}}>
            <Text style={styles.bubbleTitle}>{title}</Text>
            <Text style={styles.bubbleMessage}>{message}</Text>
            <Pressable style={styles.closeButton} onPress={() => setVisible(false)}>
              <Text style={styles.closeButtonText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  buttonText: {
    fontSize: 16,
    color: '#889',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  bubble: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    maxWidth: 340,
    width: '100%',
  },
  bubbleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#223',
    marginBottom: 8,
  },
  bubbleMessage: {
    fontSize: 14,
    color: '#556',
    lineHeight: 20,
    marginBottom: 16,
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1a7f37',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
});
