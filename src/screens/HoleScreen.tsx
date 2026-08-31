import { View, Text, Button } from 'react-native';
import { useRoundState } from '../state/useRoundState';

export default function HoleScreen() {
  const hole = useRoundState((state) => state.hole);
  const nextHole = useRoundState((state) => state.nextHole);

  return (
    <View>
      <Text>Hole {hole}</Text>
      <Button title="Next Hole" onPress={nextHole} />
    </View>
  );
}