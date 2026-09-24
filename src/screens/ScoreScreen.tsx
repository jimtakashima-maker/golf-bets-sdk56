import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Alert } from 'react-native';
import {
  useRoundState,
  HolesInfo,
  HoleScores,
  NassauState,
  NassauSegmentState,
  Player,
  PlayerHandicaps,
  NASSAU_HALF_HOLES,
  relativeHandicaps,
  strokesReceivedOnHole,
  WolfBet,
  WolfDecision,
} from '../state/useRoundState';
import ScoreEntry from '../components/ScoreEntry';
import MyStatsEntry from '../components/MyStatsEntry';
import SmackTalkSender from '../components/SmackTalkSender';
import NassauPressPanel from '../components/NassauPressPanel';
import WolfDecisionCard from '../components/WolfDecisionCard';

export default function ScoreScreen() {
  const groups = useRoundState((state) => state.groups);
  const myGroupId = useRoundState((state) => state.myGroupId);
  const playerId = useRoundState((state) => state.playerId);
  const hostId = useRoundState((state) => state.hostId);
  const scoringGroupId = useRoundState((state) => state.scoringGroupId);
  const currentHole = useRoundState((state) => state.currentHole);
  const totalHoles = useRoundState((state) => state.totalHoles);
  const holes = useRoundState((state) => state.holes);
  const nassau = useRoundState((state) => state.nassau);
  const matchPlay = useRoundState((state) => state.matchPlay);
  const handicaps = useRoundState((state) => state.handicaps);
  const nassauPressResults = useRoundState((state) => state.nassauPressResults);
  const nassauPressStacking = useRoundState((state) => state.nassauPressStacking);
  const wolfBets = useRoundState((state) => state.wolfBets);
  const wolfDecisions = useRoundState((state) => state.wolfDecisions);

  const setCurrentHole = useRoundState((state) => state.setCurrentHole);
  const setScoringGroupId = useRoundState((state) => state.setScoringGroupId);
  const enterScore = useRoundState((state) => state.enterScore);
  const myHoleStats = useRoundState((state) => state.myHoleStats);
  const setHoleStat = useRoundState((state) => state.setHoleStat);
  const submitGroupScores = useRoundState((state) => state.submitGroupScores);
  const callNassauPress = useRoundState((state) => state.callNassauPress);
  const setWolfDecision = useRoundState((state) => state.setWolfDecision);
  const clearWolfDecision = useRoundState((state) => state.clearWolfDecision);

  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [smackTalkOpen, setSmackTalkOpen] = useState(false);

  // Hosts can score (or correct) any tee group, not just their own - useful
  // for testing and for fixing a mistake without borrowing someone else's
  // phone. Everyone else is always scoring their own group.
  const isHost = hostId != null && playerId === hostId;
  const activeGroupId = scoringGroupId ?? myGroupId;
  const activeGroup = groups.find((group) => group.id === activeGroupId);
  const players = activeGroup?.players ?? [];
  const scores = activeGroup?.scores ?? {};

  // Strokes are allocated relative to the lowest handicap actually
  // playing in the round - round-wide across every tee group, not just
  // whoever's currently being scored - so the low-handicap player plays
  // scratch and everyone else only gets the strokes they need to close
  // the gap.
  const allPlayers = groups.flatMap((group) => group.players);
  const adjustedHandicaps = relativeHandicaps(handicaps, allPlayers, totalHoles);
  const currentStrokeIndex = holes[currentHole]?.handicapIndex ?? currentHole;

  // A stored par of 0 (or anything non-positive) is invalid data, not a
  // real course - fall back to 4 rather than letting it flow into the
  // "fill blanks with par" step below and produce an impossible score.
  const rawPar = holes[currentHole]?.par;
  const par = rawPar != null && rawPar > 0 ? rawPar : 4;
  const scoresSubmitted = activeGroup?.scoresSubmitted ?? false;
  const isLastHole = currentHole >= totalHoles;

  // A press only makes sense while a matchup is still live - once either
  // side's tee group has submitted its scorecard, that side is done for
  // the round, so a new press on it wouldn't have anything left to settle.
  const submittedPlayerIds = new Set(
    groups.filter((group) => group.scoresSubmitted).flatMap((group) => group.players.map((p) => p.id))
  );

  // Nassau matchups are now scoped to a single tee group, so this is
  // normally just the active group's own matchup - but the filter is kept
  // explicit (rather than assuming exactly one) in case that ever changes.
  const activeGroupPlayerIds = new Set(players.map((p) => p.id));
  const activeGroupMatchups = nassau.filter(
    (matchup) =>
      matchup.playerIdsA.every((id) => activeGroupPlayerIds.has(id)) &&
      matchup.playerIdsB.every((id) => activeGroupPlayerIds.has(id))
  );

  // A Wolf bet only makes sense to run from one scoring device when its
  // whole rotation (3 or 4 players) is in the tee group being scored right
  // now - a bet split across tee groups has no single device that could
  // ever see every player's score to resolve a hole (see computeWolfForBet).
  const activeGroupWolfBets = wolfBets.filter(
    (bet) => bet.playerIds.length >= 3 && bet.playerIds.every((id) => activeGroupPlayerIds.has(id))
  );

  // Any player who didn't get an explicit score on the hole being left is
  // assumed to have made par - so tapping Next always locks in a real score
  // instead of leaving the hole blank.
  const fillMissingScoresWithPar = () => {
    const holeScores = scores[currentHole] ?? {};
    players.forEach((player) => {
      if (holeScores[player.id] == null) {
        enterScore(currentHole, player.id, par);
      }
    });
  };

  const goToPreviousHole = () => {
    if (currentHole > 1) setCurrentHole(currentHole - 1);
  };

  const goToNextHole = () => {
    if (currentHole < totalHoles) {
      fillMissingScoresWithPar();
      setCurrentHole(currentHole + 1);
    }
  };

  // Reaching the last hole swaps the Next button for Submit - tapping it
  // locks in any blank scores at par (same as Next always has) and opens
  // the scorecard so the group can review everything before confirming.
  const handleReachLastHole = () => {
    fillMissingScoresWithPar();
    setScorecardOpen(true);
  };

  const handleSubmitScores = () => {
    if (!activeGroupId) return;
    submitGroupScores(activeGroupId);
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {isHost && groups.length > 1 && (
          <View style={styles.hostSwitcherWrap}>
            <Text style={styles.hostSwitcherLabel}>Scoring for</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hostSwitcherRow}
            >
              {groups.map((group) => {
                const isActive = group.id === activeGroupId;
                return (
                  <Pressable
                    key={group.id}
                    style={[styles.hostChip, isActive && styles.hostChipActive]}
                    onPress={() => setScoringGroupId(group.id === myGroupId ? null : group.id)}
                  >
                    <Text style={[styles.hostChipText, isActive && styles.hostChipTextActive]}>
                      {group.name}
                      {group.id === myGroupId ? ' (yours)' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <BetAlerts nassau={nassau} matchPlay={matchPlay} totalHoles={totalHoles} currentHole={currentHole} />

        <NassauPressPanel
          matchups={activeGroupMatchups}
          totalHoles={totalHoles}
          nassauPressResults={nassauPressResults}
          currentHole={currentHole}
          pressStacking={nassauPressStacking}
          submittedPlayerIds={submittedPlayerIds}
          onCallPress={callNassauPress}
        />

        <View style={styles.topButtonRow}>
          <Pressable style={styles.scorecardButton} onPress={() => setScorecardOpen(true)}>
            <Text style={styles.scorecardButtonText}>View Scorecard</Text>
          </Pressable>
          <Pressable style={styles.smackTalkButton} onPress={() => setSmackTalkOpen(true)}>
            <Text style={styles.smackTalkButtonText}>Talk Smack</Text>
          </Pressable>
        </View>

        <Text style={styles.holeHeading}>Hole {currentHole}</Text>
        {holes[currentHole] && (
          <Text style={styles.holeInfo}>
            Par {holes[currentHole].par} - Handicap Index {holes[currentHole].handicapIndex}
          </Text>
        )}

        <ScoreEntry
          players={players}
          currentHole={currentHole}
          scores={scores[currentHole]}
          par={par}
          adjustedHandicaps={adjustedHandicaps}
          strokeIndex={currentStrokeIndex}
          onEnterScore={(playerId, strokes) => enterScore(currentHole, playerId, strokes)}
        />

        {activeGroupWolfBets.map((bet) => (
          <WolfDecisionCard
            key={bet.id}
            bet={bet}
            decision={wolfDecisions[bet.id]?.[currentHole]}
            allPlayers={allPlayers}
            currentHole={currentHole}
            onSetDecision={(partnerId) => setWolfDecision(bet.id, currentHole, partnerId)}
            onClearDecision={() => clearWolfDecision(bet.id, currentHole)}
          />
        ))}

        {playerId != null && activeGroupId === myGroupId && (
          <MyStatsEntry
            par={par}
            stat={myHoleStats[currentHole]}
            onChange={(fairway, putts) => setHoleStat(currentHole, fairway, putts)}
          />
        )}
      </ScrollView>

      {/* Fixed at the bottom (not inside the ScrollView) so hole navigation is
          always reachable with a thumb without scrolling back up. */}
      <View style={styles.navBar}>
        <Pressable
          style={[styles.navButton, currentHole <= 1 && styles.navButtonDisabled]}
          onPress={goToPreviousHole}
          disabled={currentHole <= 1}
          hitSlop={8}
        >
          <Text style={styles.navArrow}>{'‹'}</Text>
          <Text style={styles.navLabel}>Prev</Text>
        </Pressable>

        <View style={styles.navIndicator}>
          <Text style={styles.navIndicatorText}>
            {currentHole} / {totalHoles}
          </Text>
        </View>

        <Pressable
          style={[styles.navButton, isLastHole && scoresSubmitted && styles.navButtonSubmitted]}
          onPress={isLastHole ? handleReachLastHole : goToNextHole}
          hitSlop={8}
        >
          {isLastHole ? (
            <Text style={styles.navLabel}>{scoresSubmitted ? '✓ Submitted' : 'Submit Scores'}</Text>
          ) : (
            <>
              <Text style={styles.navLabel}>Next</Text>
              <Text style={styles.navArrow}>{'›'}</Text>
            </>
          )}
        </Pressable>
      </View>

      <ScorecardModal
        visible={scorecardOpen}
        onClose={() => setScorecardOpen(false)}
        players={players}
        scores={scores}
        holes={holes}
        totalHoles={totalHoles}
        groupName={activeGroup?.name ?? 'Group'}
        alreadySubmitted={scoresSubmitted}
        canSubmit={isLastHole && !scoresSubmitted}
        onSubmit={handleSubmitScores}
        onFillScore={enterScore}
        adjustedHandicaps={adjustedHandicaps}
      />

      <SmackTalkSender visible={smackTalkOpen} onClose={() => setSmackTalkOpen(false)} />
    </View>
  );
}

interface BetAlert {
  key: string;
  kind: 'dormie' | 'closed';
  text: string;
}

// Nassau and Match Play are the only bets with a "dormie"/"closed" concept
// (Skins and Stroke Play don't work in holes-remaining terms), so only
// those two feed this. A segment only fires once, on the hole that
// actually produced the state: front/back check holesPlayed against the
// hole number within that 9, overall checks it against the hole number
// outright - so scoring the next hole naturally drops the alert instead of
// it lingering on screen.
function collectBetAlerts(
  matchups: NassauState,
  betTypeName: string,
  totalHoles: number,
  currentHole: number,
  alerts: BetAlert[]
): void {
  for (const matchup of matchups) {
    const checks: Array<{ name: string; segment: NassauSegmentState; required: number; expected: number | null }> = [
      {
        name: 'Front 9',
        segment: matchup.front,
        required: NASSAU_HALF_HOLES,
        expected: currentHole <= NASSAU_HALF_HOLES ? currentHole : null,
      },
      {
        name: 'Back 9',
        segment: matchup.back,
        required: NASSAU_HALF_HOLES,
        expected: currentHole > NASSAU_HALF_HOLES ? currentHole - NASSAU_HALF_HOLES : null,
      },
      { name: 'Overall', segment: matchup.overall, required: totalHoles, expected: currentHole },
    ];

    for (const { name, segment, required, expected } of checks) {
      if (expected == null || segment.holesPlayed !== expected || segment.status === 0) continue;
      const margin = Math.abs(segment.status);
      const leaderLabel = segment.status > 0 ? matchup.labelA : matchup.labelB;
      const trailLabel = segment.status > 0 ? matchup.labelB : matchup.labelA;
      const matchupKey = `${matchup.idA}|${matchup.idB}|${name}`;

      if (segment.closedAtHole === currentHole) {
        alerts.push({
          key: `${matchupKey}-closed`,
          kind: 'closed',
          text: `${betTypeName} ${name} closed - ${leaderLabel} beat ${trailLabel}`,
        });
        continue;
      }

      const remaining = required - segment.holesPlayed;
      if (remaining > 0 && margin === remaining) {
        alerts.push({
          key: `${matchupKey}-dormie`,
          kind: 'dormie',
          text: `${betTypeName} ${name}: ${leaderLabel} dormie vs ${trailLabel}`,
        });
      }
    }
  }
}

// Transient warnings for the hole just scored - a bet going dormie, or a
// bet closing out early - so the group notices right when it happens
// without needing to check the Leaderboard tab. Tied to the current hole,
// not a timer: move on to the next hole and these clear on their own.
function BetAlerts({
  nassau,
  matchPlay,
  totalHoles,
  currentHole,
}: {
  nassau: NassauState;
  matchPlay: NassauState;
  totalHoles: number;
  currentHole: number;
}) {
  const alerts: BetAlert[] = [];
  collectBetAlerts(nassau, 'Nassau', totalHoles, currentHole, alerts);
  collectBetAlerts(matchPlay, 'Match Play', totalHoles, currentHole, alerts);

  if (alerts.length === 0) return null;

  return (
    <View style={styles.alertStack}>
      {alerts.map((alert) => (
        <View
          key={alert.key}
          style={[styles.alertRow, alert.kind === 'closed' ? styles.alertRowClosed : styles.alertRowDormie]}
        >
          <Text
            style={[styles.alertBadge, alert.kind === 'closed' ? styles.alertBadgeClosed : styles.alertBadgeDormie]}
          >
            {alert.kind === 'closed' ? 'CLOSED' : 'DORMIE'}
          </Text>
          <Text style={styles.alertText}>{alert.text}</Text>
        </View>
      ))}
    </View>
  );
}

// The full 18-hole grid - every hole's par and every player's strokes,
// with running totals - for whichever group is currently active. Player
// names stay fixed on the left while the hole columns scroll horizontally,
// since 18 holes never fit on a phone screen at once.
function ScorecardModal({
  visible,
  onClose,
  players,
  scores,
  holes,
  totalHoles,
  groupName,
  alreadySubmitted,
  canSubmit,
  onSubmit,
  onFillScore,
  adjustedHandicaps,
}: {
  visible: boolean;
  onClose: () => void;
  players: Player[];
  scores: HoleScores;
  holes: HolesInfo;
  totalHoles: number;
  groupName: string;
  alreadySubmitted: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  onFillScore: (hole: number, playerId: string, strokes: number) => void;
  adjustedHandicaps: PlayerHandicaps;
}) {
  const holeNumbers = Array.from({ length: totalHoles }, (_, index) => index + 1);
  const totalPar = holeNumbers.reduce((sum, hole) => sum + (holes[hole]?.par ?? 0), 0);

  // Every (hole, player) pair still missing a score - checked at submit
  // time so a scorecard can never be submitted with gaps, regardless of
  // how it got that way (a device that jumped straight to this modal, or
  // players scoring different holes on different devices).
  const missingEntries: { hole: number; playerId: string }[] = [];
  holeNumbers.forEach((hole) => {
    players.forEach((player) => {
      if (scores[hole]?.[player.id] == null) {
        missingEntries.push({ hole, playerId: player.id });
      }
    });
  });

  const strokesOn = (playerId: string, hole: number): number =>
    strokesReceivedOnHole(adjustedHandicaps[playerId] ?? 0, holes[hole]?.handicapIndex ?? hole);
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

  // Front/back-9 subtotals (the classic "OUT"/"IN" columns) - only
  // meaningful once there's a back nine to split from, so a 9-hole round
  // just keeps its single running total instead of a redundant subtotal.
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

  // Column list drives every row so the header, par, and each player row
  // all insert the OUT/IN subtotal in exactly the same spot.
  type ScorecardColumn = { kind: 'hole'; hole: number } | { kind: 'out' } | { kind: 'in' };
  const columns: ScorecardColumn[] = [];
  holeNumbers.forEach((hole) => {
    columns.push({ kind: 'hole', hole });
    if (showNineSplit && hole === 9) columns.push({ kind: 'out' });
  });
  if (showNineSplit) columns.push({ kind: 'in' });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.scorecardSheet}>
        <Text style={styles.scorecardTitle}>Scorecard</Text>
        {anyStrokesGiven && (
          <Text style={styles.scorecardStrokeHint}>{'\u25cf'} marks a hole where that player gets a handicap stroke</Text>
        )}

        {players.length === 0 ? (
          <Text style={styles.scorecardEmptyHint}>No players in this group yet.</Text>
        ) : (
          <View style={styles.scorecardBody}>
            <View style={styles.scorecardStickyCol}>
              <View style={styles.scorecardCell}>
                <Text style={styles.scorecardStickyHeaderText}>Hole</Text>
              </View>
              <View style={styles.scorecardCell}>
                <Text style={styles.scorecardStickyText}>Par</Text>
              </View>
              {players.map((player) => (
                <View style={styles.scorecardCell} key={player.id}>
                  <Text style={styles.scorecardStickyText} numberOfLines={1}>
                    {player.name}
                  </Text>
                </View>
              ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.scorecardRow}>
                  {columns.map((column) =>
                    column.kind === 'hole' ? (
                      <View style={styles.scorecardGridCell} key={`hole-${column.hole}`}>
                        <Text style={styles.scorecardHeaderText}>{column.hole}</Text>
                      </View>
                    ) : (
                      <View style={styles.scorecardSubtotalCell} key={column.kind}>
                        <Text style={styles.scorecardHeaderText}>{column.kind === 'out' ? 'OUT' : 'IN'}</Text>
                      </View>
                    )
                  )}
                  <View style={styles.scorecardGridCell}>
                    <Text style={styles.scorecardHeaderText}>Tot</Text>
                  </View>
                  <View style={styles.scorecardGridCell}>
                    <Text style={styles.scorecardHeaderText}>+/-</Text>
                  </View>
                </View>

                <View style={styles.scorecardRow}>
                  {columns.map((column) =>
                    column.kind === 'hole' ? (
                      <View style={styles.scorecardGridCell} key={`hole-${column.hole}`}>
                        <Text style={styles.scorecardParText}>{holes[column.hole]?.par ?? '-'}</Text>
                      </View>
                    ) : (
                      <View style={styles.scorecardSubtotalCell} key={column.kind}>
                        <Text style={styles.scorecardParText}>{column.kind === 'out' ? frontPar : backPar}</Text>
                      </View>
                    )
                  )}
                  <View style={styles.scorecardGridCell}>
                    <Text style={styles.scorecardParText}>{totalPar}</Text>
                  </View>
                  <View style={styles.scorecardGridCell}>
                    <Text style={styles.scorecardParText}>E</Text>
                  </View>
                </View>

                {players.map((player) => {
                  const { strokes, toPar, played } = playerTotals(player.id);
                  return (
                    <View style={styles.scorecardRow} key={player.id}>
                      {columns.map((column) => {
                        if (column.kind === 'hole') {
                          const hole = column.hole;
                          return (
                            <View style={styles.scorecardGridCell} key={`hole-${hole}`}>
                              <Text style={styles.scorecardScoreText}>
                                {scores[hole]?.[player.id] ?? '-'}
                              </Text>
                              {strokesOn(player.id, hole) > 0 && <View style={styles.scorecardStrokeDot} />}
                            </View>
                          );
                        }
                        const subtotal = playerSubtotal(player.id, column.kind === 'out' ? frontNine : backNine);
                        return (
                          <View style={styles.scorecardSubtotalCell} key={column.kind}>
                            <Text style={styles.scorecardScoreText}>
                              {subtotal.played > 0 ? subtotal.strokes : '-'}
                            </Text>
                          </View>
                        );
                      })}
                      <View style={styles.scorecardGridCell}>
                        <Text style={styles.scorecardScoreText}>{played > 0 ? strokes : '-'}</Text>
                      </View>
                      <View style={styles.scorecardGridCell}>
                        <Text style={styles.scorecardScoreText}>
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

        {alreadySubmitted ? (
          <View style={styles.submittedBanner}>
            <Text style={styles.submittedBannerText}>{'✓'} Scores submitted</Text>
          </View>
        ) : canSubmit ? (
          <Pressable
            style={styles.submitScoresButton}
            onPress={() => {
              if (missingEntries.length > 0) {
                const count = missingEntries.length;
                Alert.alert(
                  'Incomplete holes',
                  `${count} score${count === 1 ? '' : 's'} ${count === 1 ? 'is' : 'are'} still blank. ` +
                    'Proceed with triple bogeys for the blank holes, or go back and correct them?',
                  [
                    { text: 'Correct', style: 'cancel' },
                    {
                      text: 'Use Triple Bogeys',
                      style: 'destructive',
                      onPress: () => {
                        missingEntries.forEach(({ hole, playerId }) => {
                          const par = holes[hole]?.par ?? 4;
                          onFillScore(hole, playerId, par + 3);
                        });
                        onSubmit();
                      },
                    },
                  ]
                );
                return;
              }
              Alert.alert(`Submit ${groupName}'s scorecard?`, "You'll still be able to review it here after submitting.", [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Submit', onPress: onSubmit },
              ]);
            }}
          >
            <Text style={styles.submitScoresButtonText}>Submit Scores</Text>
          </Pressable>
        ) : null}

        <Pressable style={styles.modalCloseButton} onPress={onClose}>
          <Text style={styles.modalCloseButtonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  holeHeading: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  holeInfo: {
    textAlign: 'center',
    color: '#667',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  hostSwitcherWrap: {
    marginBottom: 12,
  },
  hostSwitcherLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#667',
    marginBottom: 6,
  },
  hostSwitcherRow: {
    gap: 8,
    paddingRight: 8,
  },
  hostChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  hostChipActive: {
    backgroundColor: '#1a7f37',
    borderColor: '#1a7f37',
  },
  hostChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#445',
  },
  hostChipTextActive: {
    color: '#fff',
  },
  alertStack: {
    marginBottom: 12,
    gap: 6,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  alertRowDormie: {
    backgroundColor: '#fdf1de',
  },
  alertRowClosed: {
    backgroundColor: '#fbe9e7',
  },
  alertBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    marginRight: 8,
    overflow: 'hidden',
  },
  alertBadgeDormie: {
    backgroundColor: '#b5730a',
  },
  alertBadgeClosed: {
    backgroundColor: '#b3261e',
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  topButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  scorecardButton: {
    borderWidth: 1,
    borderColor: '#1a7f37',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  smackTalkButton: {
    borderWidth: 1,
    borderColor: '#c0392b',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  smackTalkButtonText: {
    color: '#c0392b',
    fontWeight: '600',
    fontSize: 13,
  },
  scorecardButtonText: {
    color: '#1a7f37',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scorecardSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  scorecardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  scorecardEmptyHint: {
    color: '#889',
    marginBottom: 12,
  },
  scorecardStrokeHint: {
    color: '#889',
    fontSize: 12,
    marginBottom: 10,
  },
  scorecardStrokeDot: {
    position: 'absolute',
    top: 4,
    right: 5,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#2d6cdf',
  },
  scorecardBody: {
    flexDirection: 'row',
  },
  scorecardStickyCol: {
    width: 88,
  },
  scorecardCell: {
    height: 36,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  scorecardStickyHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
  },
  scorecardStickyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  scorecardRow: {
    flexDirection: 'row',
  },
  scorecardGridCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderLeftWidth: 1,
    borderLeftColor: '#f3f3f3',
  },
  scorecardSubtotalCell: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderLeftWidth: 1,
    borderLeftColor: '#ccc',
    backgroundColor: '#f7f8fa',
  },
  scorecardHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
  },
  scorecardParText: {
    fontSize: 12,
    color: '#889',
  },
  scorecardScoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  submitScoresButton: {
    alignSelf: 'stretch',
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1a7f37',
    alignItems: 'center',
  },
  submitScoresButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  submittedBanner: {
    alignSelf: 'stretch',
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#eef8f0',
    alignItems: 'center',
  },
  submittedBannerText: {
    color: '#1a7f37',
    fontWeight: '700',
    fontSize: 15,
  },
  modalCloseButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalCloseButtonText: {
    color: '#556',
    fontWeight: '600',
  },
  navBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    backgroundColor: '#1a7f37',
    gap: 4,
  },
  navButtonDisabled: {
    backgroundColor: '#c7ddcd',
  },
  navButtonSubmitted: {
    backgroundColor: '#c7ddcd',
  },
  navArrow: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 28,
  },
  navLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  navIndicator: {
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f3f3',
  },
  navIndicatorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#445',
  },
});
