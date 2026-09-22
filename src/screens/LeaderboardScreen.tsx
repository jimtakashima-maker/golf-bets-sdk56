import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRoundState, Group, HolesInfo, PlayerHandicaps, toNetScores } from '../state/useRoundState';
import NassauStatus from '../components/NassauStatus';
import MatchPlayStatus from '../components/MatchPlayStatus';
import SkinsStatus from '../components/SkinsStatus';
import StrokePlayStatus from '../components/StrokePlayStatus';
import BirdiesStatus from '../components/BirdiesStatus';
import DoublesStatus from '../components/DoublesStatus';

type ScoringMode = 'gross' | 'net';

interface PlayerTotal {
  id: string;
  name: string;
  strokes: number;
  toPar: number;
  holesPlayed: number;
}

// Totals every player's strokes and to-par across whatever holes they've
// entered, pulling from each tee group's own scores since that's where
// they live - a player only ever appears in one group. A hole with no par
// recorded yet falls back to 4 (matching how the Scoring tab treats an
// unset par) instead of 0, so a round with an incomplete scorecard still
// reads as a score relative to par rather than a raw stroke total. In net
// mode, scores are first converted with each player's handicap allocation
// before par is subtracted.
function computePlayerTotals(
  groups: Group[],
  holes: HolesInfo,
  mode: ScoringMode,
  handicaps: PlayerHandicaps,
  totalHoles: number
): PlayerTotal[] {
  const totals: PlayerTotal[] = [];
  const allPlayers = groups.flatMap((group) => group.players);
  for (const group of groups) {
    const scores =
      mode === 'net' ? toNetScores(group.scores, holes, handicaps, allPlayers, totalHoles) : group.scores;
    for (const player of group.players) {
      let strokes = 0;
      let par = 0;
      let holesPlayed = 0;
      for (const [holeKey, holeScores] of Object.entries(scores)) {
        const score = holeScores[player.id];
        if (score == null) continue;
        const rawPar = holes[Number(holeKey)]?.par;
        par += rawPar != null && rawPar > 0 ? rawPar : 4;
        strokes += score;
        holesPlayed += 1;
      }
      totals.push({ id: player.id, name: player.name, strokes, toPar: strokes - par, holesPlayed });
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
  mode,
  handicaps,
}: {
  groups: Group[];
  holes: HolesInfo;
  totalHoles: number;
  mode: ScoringMode;
  handicaps: PlayerHandicaps;
}) {
  const all = computePlayerTotals(groups, holes, mode, handicaps, totalHoles);
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
        <Text style={[styles.boardHeaderText, styles.boardThru]}>THRU</Text>
        <Text style={[styles.boardHeaderText, styles.boardScore]}>SCORE</Text>
      </View>
      {ranked.map((player, index) => {
        const isUnder = player.toPar < 0;
        const isOver = player.toPar > 0;
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
  const [mode, setMode] = useState<ScoringMode>('gross');

  // Bet teams span tee groups, so Nassau results are shown once for the
  // whole round rather than repeated per tee group.
  const allPlayers = groups.flatMap((group) => group.players);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <View style={styles.modeChips}>
          <Pressable
            style={[styles.modeChip, mode === 'gross' && styles.modeChipActive]}
            onPress={() => setMode('gross')}
          >
            <Text style={[styles.modeChipText, mode === 'gross' && styles.modeChipTextActive]}>Gross</Text>
          </Pressable>
          <Pressable
            style={[styles.modeChip, mode === 'net' && styles.modeChipActive]}
            onPress={() => setMode('net')}
          >
            <Text style={[styles.modeChipText, mode === 'net' && styles.modeChipTextActive]}>Net</Text>
          </Pressable>
        </View>
      </View>

      <LeaderboardBoard
        groups={groups}
        holes={holes}
        totalHoles={totalHoles}
        mode={mode}
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
  headingRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeChips: {
    flexDirection: 'row',
    gap: 6,
  },
  modeChip: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f7f7f7',
  },
  modeChipActive: {
    backgroundColor: '#16513a',
    borderColor: '#16513a',
  },
  modeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#445',
  },
  modeChipTextActive: {
    color: '#fff',
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
    width: 40,
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
