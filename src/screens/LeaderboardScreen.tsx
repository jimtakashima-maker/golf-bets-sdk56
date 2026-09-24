import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoundState, Group, HolesInfo, PlayerHandicaps, toNetScores } from '../state/useRoundState';
import NassauStatus from '../components/NassauStatus';
import MatchPlayStatus from '../components/MatchPlayStatus';
import SkinsStatus from '../components/SkinsStatus';
import StrokePlayStatus from '../components/StrokePlayStatus';
import BirdiesStatus from '../components/BirdiesStatus';
import DoublesStatus from '../components/DoublesStatus';

interface PlayerTotal {
  id: string;
  name: string;
  strokes: number;
  toPar: number;
  netStrokes: number;
  netToPar: number;
  holesPlayed: number;
}

// Totals every player's gross AND net strokes/to-par across whatever holes
// they've entered, pulling from each tee group's own scores since that's
// where they live - a player only ever appears in one group. A hole with
// no par recorded yet falls back to 4 (matching how the Scoring tab treats
// an unset par) instead of 0, so a round with an incomplete scorecard
// still reads as a score relative to par rather than a raw stroke total.
// Both are always computed - which of them the board actually shows is a
// display decision made by the caller (see showNetColumn), not something
// worth recomputing totals over.
function computePlayerTotals(
  groups: Group[],
  holes: HolesInfo,
  handicaps: PlayerHandicaps,
  totalHoles: number
): PlayerTotal[] {
  const totals: PlayerTotal[] = [];
  const allPlayers = groups.flatMap((group) => group.players);
  for (const group of groups) {
    const netScores = toNetScores(group.scores, holes, handicaps, allPlayers, totalHoles);
    for (const player of group.players) {
      let strokes = 0;
      let netStrokes = 0;
      let par = 0;
      let holesPlayed = 0;
      for (const [holeKey, holeScores] of Object.entries(group.scores)) {
        const score = holeScores[player.id];
        if (score == null) continue;
        const rawPar = holes[Number(holeKey)]?.par;
        par += rawPar != null && rawPar > 0 ? rawPar : 4;
        strokes += score;
        netStrokes += netScores[Number(holeKey)]?.[player.id] ?? score;
        holesPlayed += 1;
      }
      totals.push({
        id: player.id,
        name: player.name,
        strokes,
        toPar: strokes - par,
        netStrokes,
        netToPar: netStrokes - par,
        holesPlayed,
      });
    }
  }
  return totals;
}

function formatToPar(toPar: number): string {
  if (toPar === 0) return 'E';
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

interface RankedTotal extends PlayerTotal {
  posLabel: string;
}

// Standard tournament tie handling: equal scores share a position label
// ("T2"), and the next distinct score resumes counting from how many
// players are already above it (1, T2, T2, 4 - never 1, T2, T2, 3).
function assignPositions(totals: PlayerTotal[]): RankedTotal[] {
  const ranked: RankedTotal[] = [];
  let i = 0;
  while (i < totals.length) {
    let j = i;
    while (j + 1 < totals.length && totals[j + 1].toPar === totals[i].toPar) j += 1;
    const posLabel = j > i ? `T${i + 1}` : `${i + 1}`;
    for (let k = i; k <= j; k += 1) {
      ranked.push({ ...totals[k], posLabel });
    }
    i = j + 1;
  }
  return ranked;
}

function thruLabel(holesPlayed: number, totalHoles: number): string {
  if (holesPlayed === 0) return '-';
  if (holesPlayed >= totalHoles) return 'F';
  return String(holesPlayed);
}

// A tournament-style board: position, player, holes through, score to par
// - sorted best to worst with proper tie handling, the way a real golf
// leaderboard reads. Anyone with no scores yet drops to a "Not started"
// line below the board instead of cluttering the ranked rows.
function LeaderboardBoard({
  groups,
  holes,
  totalHoles,
  showNetColumn,
  handicaps,
}: {
  groups: Group[];
  holes: HolesInfo;
  totalHoles: number;
  showNetColumn: boolean;
  handicaps: PlayerHandicaps;
}) {
  const all = computePlayerTotals(groups, holes, handicaps, totalHoles);
  // Ranked by gross, same as before this had a net column at all - net
  // strokes exist to show what a bet actually pays on, not to reorder a
  // leaderboard that's otherwise read as the real, gross tournament order.
  const started = all.filter((player) => player.holesPlayed > 0).sort((a, b) => a.toPar - b.toPar);
  const notStarted = all.filter((player) => player.holesPlayed === 0);

  if (started.length === 0) {
    return (
      <View style={styles.boardCard}>
        <Text style={styles.hint}>No scores entered yet.</Text>
      </View>
    );
  }

  const ranked = assignPositions(started);

  return (
    <View style={styles.boardCard}>
      <View style={styles.boardHeaderRow}>
        <Text style={[styles.boardHeaderText, styles.boardPos]}>POS</Text>
        <Text style={[styles.boardHeaderText, styles.boardName]}>PLAYER</Text>
        <Text style={[styles.boardHeaderText, styles.boardThru]} numberOfLines={1}>
          THRU
        </Text>
        {showNetColumn ? (
          <>
            <Text style={[styles.boardHeaderText, styles.boardScoreSplit]} numberOfLines={1}>
              GROSS
            </Text>
            <Text style={[styles.boardHeaderText, styles.boardScoreSplit]} numberOfLines={1}>
              NET
            </Text>
          </>
        ) : (
          <Text style={[styles.boardHeaderText, styles.boardScore]} numberOfLines={1}>
            SCORE
          </Text>
        )}
      </View>
      {ranked.map((player, index) => {
        const isUnder = player.toPar < 0;
        const isOver = player.toPar > 0;
        const isNetUnder = player.netToPar < 0;
        const isNetOver = player.netToPar > 0;
        const isLeader = player.posLabel === '1' || player.posLabel === 'T1';
        return (
          <View
            key={player.id}
            style={[
              styles.boardRow,
              index % 2 === 1 && styles.boardRowAlt,
              isLeader && styles.boardRowLeader,
            ]}
          >
            <Text style={[styles.boardPos, styles.boardPosText]}>{player.posLabel}</Text>
            <Text style={[styles.boardName, styles.boardNameText]} numberOfLines={1}>
              {player.name}
            </Text>
            <Text style={[styles.boardThru, styles.boardThruText]}>
              {thruLabel(player.holesPlayed, totalHoles)}
            </Text>
            {showNetColumn ? (
              <>
                <Text
                  style={[
                    styles.boardScoreSplit,
                    styles.boardScoreText,
                    isUnder && styles.boardScoreUnder,
                    isOver && styles.boardScoreOver,
                  ]}
                >
                  {formatToPar(player.toPar)}
                </Text>
                <Text
                  style={[
                    styles.boardScoreSplit,
                    styles.boardScoreText,
                    isNetUnder && styles.boardScoreUnder,
                    isNetOver && styles.boardScoreOver,
                  ]}
                >
                  {formatToPar(player.netToPar)}
                </Text>
              </>
            ) : (
              <Text
                style={[
                  styles.boardScore,
                  styles.boardScoreText,
                  isUnder && styles.boardScoreUnder,
                  isOver && styles.boardScoreOver,
                ]}
              >
                {formatToPar(player.toPar)}
              </Text>
            )}
          </View>
        );
      })}
      {notStarted.length > 0 && (
        <Text style={styles.boardNotStarted}>
          Not started: {notStarted.map((player) => player.name).join(', ')}
        </Text>
      )}
    </View>
  );
}

export default function LeaderboardScreen() {
  const groups = useRoundState((state) => state.groups);
  const holes = useRoundState((state) => state.holes);
  const nassau = useRoundState((state) => state.nassau);
  const matchPlay = useRoundState((state) => state.matchPlay);
  const skins = useRoundState((state) => state.skins);
  const strokePlay = useRoundState((state) => state.strokePlay);
  const birdies = useRoundState((state) => state.birdies);
  const doubles = useRoundState((state) => state.doubles);
  const totalHoles = useRoundState((state) => state.totalHoles);
  const handicaps = useRoundState((state) => state.handicaps);
  const nassauNet = useRoundState((state) => state.nassauNet);
  const matchPlayNet = useRoundState((state) => state.matchPlayNet);
  const skinsBets = useRoundState((state) => state.skinsBets);
  const strokePlayBets = useRoundState((state) => state.strokePlayBets);
  const birdiesBets = useRoundState((state) => state.birdiesBets);
  const doublesBets = useRoundState((state) => state.doublesBets);

  // Bet teams span tee groups, so Nassau results are shown once for the
  // whole round rather than repeated per tee group.
  const allPlayers = groups.flatMap((group) => group.players);

  // The board shows a Net column only when it would actually mean
  // something to someone - i.e. at least one active bet settles on net
  // score. With nothing net in play, gross is the only score that matters
  // to anyone's money, so the board stays exactly as simple as it always
  // was rather than showing a second column nobody asked for.
  const anyBetIsNet =
    nassauNet ||
    matchPlayNet ||
    skinsBets.some((bet) => bet.net) ||
    strokePlayBets.some((bet) => bet.net) ||
    birdiesBets.some((bet) => bet.net) ||
    doublesBets.some((bet) => bet.net);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LeaderboardBoard
        groups={groups}
        holes={holes}
        totalHoles={totalHoles}
        showNetColumn={anyBetIsNet}
        handicaps={handicaps}
      />

      <NassauStatus nassau={nassau} players={allPlayers} totalHoles={totalHoles} />
      <MatchPlayStatus matchPlay={matchPlay} players={allPlayers} totalHoles={totalHoles} />
      <SkinsStatus skins={skins} />
      <StrokePlayStatus strokePlay={strokePlay} players={allPlayers} />
      <BirdiesStatus birdies={birdies} />
      <DoublesStatus doubles={doubles} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  hint: {
    color: '#667',
    fontSize: 13,
  },
  boardCard: {
    marginTop: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e6ea',
  },
  boardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16513a',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  boardHeaderText: {
    color: '#dcefe3',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  boardRowAlt: {
    backgroundColor: '#f6f8f7',
  },
  boardRowLeader: {
    backgroundColor: '#fbf3d9',
  },
  boardPos: {
    width: 28,
  },
  boardPosText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#445',
  },
  boardName: {
    flex: 1,
    marginRight: 4,
  },
  boardNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1c2b22',
  },
  boardThru: {
    width: 46,
    alignItems: 'center',
  },
  boardThruText: {
    fontSize: 12,
    color: '#667',
    textAlign: 'center',
  },
  boardScore: {
    width: 48,
  },
  // Half-width GROSS/NET pair used instead of boardScore when a net bet
  // is active - two numbers in roughly the space one used to take.
  boardScoreSplit: {
    width: 46,
  },
  boardScoreText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#445',
    textAlign: 'right',
  },
  boardScoreUnder: {
    color: '#1a7f37',
  },
  boardScoreOver: {
    color: '#c0392b',
  },
  boardNotStarted: {
    color: '#889',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});
