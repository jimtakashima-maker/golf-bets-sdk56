import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Player, HoleScores, HolesInfo, PlayerHandicaps, strokesReceivedOnHole } from '../state/useRoundState';

// A read-only, full hole-by-hole scorecard grid for one tee group - same
// shape as ScoreScreen's own ScorecardModal (OUT/IN subtotals, a dot on
// any hole where a player gets a handicap stroke), just without the
// submit/missing-score machinery that only makes sense mid-round. Built
// as its own standalone component (not a reuse of ScorecardModal itself)
// so History's "View Round" screen can render one of these per tee group
// inline on the page, not inside a Modal.
export default function RoundScorecardGrid({
  groupName,
  players,
  scores,
  holes,
  totalHoles,
  handicaps,
}: {
  groupName: string;
  players: Player[];
  scores: HoleScores;
  holes: HolesInfo;
  totalHoles: number;
  handicaps: PlayerHandicaps;
}) {
  const holeNumbers = Array.from({ length: totalHoles }, (_, index) => index + 1);
  const totalPar = holeNumbers.reduce((sum, hole) => sum + (holes[hole]?.par ?? 0), 0);

  const strokesOn = (playerId: string, hole: number): number =>
    strokesReceivedOnHole(handicaps[playerId] ?? 0, holes[hole]?.handicapIndex ?? hole);
  const anyStrokesGiven = players.some((player) => holeNumbers.some((hole) => strokesOn(player.id, hole) > 0));

  const playerTotals = (playerId: string) => {
    let strokes = 0;
    let parPlayed = 0;
    let played = 0;
    holeNumbers.forEach((hole) => {
      const strokesOnHole = scores[hole]?.[playerId];
      if (strokesOnHole != null) {
        strokes += strokesOnHole;
        parPlayed += holes[hole]?.par ?? 0;
        played += 1;
      }
    });
    return { strokes, toPar: strokes - parPlayed, played };
  };

  const showNineSplit = totalHoles > 9;
  const frontNine = holeNumbers.filter((hole) => hole <= 9);
  const backNine = holeNumbers.filter((hole) => hole > 9);
  const sumPar = (subset: number[]) => subset.reduce((sum, hole) => sum + (holes[hole]?.par ?? 0), 0);
  const frontPar = sumPar(frontNine);
  const backPar = sumPar(backNine);

  const playerSubtotal = (playerId: string, subset: number[]) => {
    let strokes = 0;
    let played = 0;
    subset.forEach((hole) => {
      const strokesOnHole = scores[hole]?.[playerId];
      if (strokesOnHole != null) {
        strokes += strokesOnHole;
        played += 1;
      }
    });
    return { strokes, played };
  };

  type ScorecardColumn = { kind: 'hole'; hole: number } | { kind: 'out' } | { kind: 'in' };
  const columns: ScorecardColumn[] = [];
  holeNumbers.forEach((hole) => {
    columns.push({ kind: 'hole', hole });
    if (showNineSplit && hole === 9) columns.push({ kind: 'out' });
  });
  if (showNineSplit) columns.push({ kind: 'in' });

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{groupName}</Text>
      {anyStrokesGiven && <Text style={styles.strokeHint}>{'●'} marks a handicap stroke</Text>}

      {players.length === 0 ? (
        <Text style={styles.emptyHint}>No players in this group.</Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.stickyCol}>
            <View style={styles.cell}>
              <Text style={styles.stickyHeaderText}>Hole</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.stickyText}>Par</Text>
            </View>
            {players.map((player) => (
              <View style={styles.cell} key={player.id}>
                <Text style={styles.stickyText} numberOfLines={1}>
                  {player.name}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.row}>
                {columns.map((column) =>
                  column.kind === 'hole' ? (
                    <View style={styles.gridCell} key={`hole-${column.hole}`}>
                      <Text style={styles.headerText}>{column.hole}</Text>
                    </View>
                  ) : (
                    <View style={styles.subtotalCell} key={column.kind}>
                      <Text style={styles.headerText}>{column.kind === 'out' ? 'OUT' : 'IN'}</Text>
                    </View>
                  )
                )}
                <View style={styles.gridCell}>
                  <Text style={styles.headerText}>Tot</Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={styles.headerText}>+/-</Text>
                </View>
              </View>

              <View style={styles.row}>
                {columns.map((column) =>
                  column.kind === 'hole' ? (
                    <View style={styles.gridCell} key={`hole-${column.hole}`}>
                      <Text style={styles.parText}>{holes[column.hole]?.par ?? '-'}</Text>
                    </View>
                  ) : (
                    <View style={styles.subtotalCell} key={column.kind}>
                      <Text style={styles.parText}>{column.kind === 'out' ? frontPar : backPar}</Text>
                    </View>
                  )
                )}
                <View style={styles.gridCell}>
                  <Text style={styles.parText}>{totalPar}</Text>
                </View>
                <View style={styles.gridCell}>
                  <Text style={styles.parText}>E</Text>
                </View>
              </View>

              {players.map((player) => {
                const { strokes, toPar, played } = playerTotals(player.id);
                return (
                  <View style={styles.row} key={player.id}>
                    {columns.map((column) => {
                      if (column.kind === 'hole') {
                        const hole = column.hole;
                        return (
                          <View style={styles.gridCell} key={`hole-${hole}`}>
                            <Text style={styles.scoreText}>{scores[hole]?.[player.id] ?? '-'}</Text>
                            {strokesOn(player.id, hole) > 0 && <View style={styles.strokeDot} />}
                          </View>
                        );
                      }
                      const subtotal = playerSubtotal(player.id, column.kind === 'out' ? frontNine : backNine);
                      return (
                        <View style={styles.subtotalCell} key={column.kind}>
                          <Text style={styles.scoreText}>{subtotal.played > 0 ? subtotal.strokes : '-'}</Text>
                        </View>
                      );
                    })}
                    <View style={styles.gridCell}>
                      <Text style={styles.scoreText}>{played > 0 ? strokes : '-'}</Text>
                    </View>
                    <View style={styles.gridCell}>
                      <Text style={styles.scoreText}>
                        {played === 0 ? '-' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const CELL_WIDTH = 34;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f7f8fa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#234',
    marginBottom: 4,
  },
  strokeHint: {
    fontSize: 11,
    color: '#889',
    marginBottom: 8,
  },
  emptyHint: {
    color: '#889',
    fontSize: 13,
  },
  body: {
    flexDirection: 'row',
  },
  stickyCol: {
    backgroundColor: '#f7f8fa',
  },
  cell: {
    height: 32,
    justifyContent: 'center',
    paddingRight: 8,
    minWidth: 76,
    maxWidth: 76,
  },
  stickyHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#889',
    textTransform: 'uppercase',
  },
  stickyText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#234',
  },
  row: {
    flexDirection: 'row',
  },
  gridCell: {
    width: CELL_WIDTH,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtotalCell: {
    width: CELL_WIDTH + 6,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eceff3',
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#889',
  },
  parText: {
    fontSize: 12,
    color: '#889',
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  strokeDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1a7f37',
  },
});
