import { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Pressable } from 'react-native';
import { Player } from '../state/useRoundState';

interface PlayerManagerProps {
  players: Player[];
  onAddPlayer: (name: string) => void;
  onRemovePlayer: (id: string) => void;
}

export default function PlayerManager({ players, onAddPlayer, onRemovePlayer }: PlayerManagerProps) {
  const [name, setName] = useState('');

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAddPlayer(trimmed);
    setName('');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Players</Text>

      {players.length === 0 && <Text style={styles.hint}>No players yet</Text>}

      {players.map((player) => (
        <View key={player.id} style={styles.playerRow}>
          <Text style={styles.playerName}>{player.name}</Text>
          <Pressable onPress={() => onRemovePlayer(player.id)} hitSlop={8}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Player name"
          value={name}
          onChangeText={setName}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Button title="Add" onPress={handleAdd} disabled={!name.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  hint: {
    color: '#667',
    marginBottom: 8,
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  playerName: {
    fontSize: 15,
  },
  remove: {
    color: '#c0392b',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
