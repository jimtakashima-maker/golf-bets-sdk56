import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { NassauState, NassauMatchup, NassauSegmentState, Player, NASSAU_HALF_HOLES } from '../state/useRoundState';

interface MatchPlayStatusProps {
  matchPlay: NassauState;
  players: Player[];
  totalHoles: number;
}

// requiredHoles is 9 for front/back, the round's full length for overall -
// used to work out how many holes are left in the segment. The team name
// is left-justified, and "up N"/"N to play" each get their own fixed-width
// column so the numbers line up vertically across Front 9 / Back 9 /
// Overall instead of drifting with the name's length. "Dormie" means the
// trailing side can, at best, halve the segment from here (their deficit
// exactly matches the holes left). "Closed" means the segment is already
// mathematically decided - the deficit is bigger than the holes left, so
// the trailing side can no longer even tie it.
function describeSegment(
  label: string,
  segment: NassauSegmentState,
  labelA: string,
  labelB: string,
  requiredHoles: number
) {
  const toPlay = Math.max(0, requiredHoles - segment.holesPlayed);
  let nameText: string;
  let upText = '';
  let toPlayText = '';
  let status: 'dormie' | 'closed' | null = null;

  if (segment.holesPlayed === 0) {
    nameText = 'Not started';
  } else if (segment.status === 0) {
    nameText = 'All square';
    if (toPlay > 0) toPlayText = `${toPlay} to play`;
  } else {
    const margin = Math.abs(segment.status);
    nameText = segment.status > 0 ? labelA : labelB;
    upText = `up ${margin}`;
    if (toPlay > 0) toPlayText = `${toPlay} to play`;
    // segment.closed is a historical fact (set the moment the margin got
    // uncatchable) so it still applies even once toPlay hits 0 - a front
    // 9 that closed out at 7 holes stays marked closed after holes 8-9
    // get filled in for the other bets.
    if (segment.closed) {
      status = 'closed';
    } else if (toPlay > 0 && margin === toPlay) {
      status = 'dormie';
    }
  }

  return (
    <View style={styles.row} key={label}>
      <View style={styles.labelWrap}>
        <Text style={styles.label}>{label}</Text>
        {status === 'dormie' && (
          <View style={[styles.sticker, styles.stickerDormie]}>
            <Text style={styles.stickerText}>DORMIE</Text>
          </View>
        )}
        {status === 'closed' && (
          <View style={[styles.sticker, styles.stickerClosed]}>
            <Text style={styles.stickerText}>CLOSED</Text>
          </View>
        )}
      </View>
      <Text style={styles.statusName} numberOfLines={1}>{nameText}</Text>
      <Text style={styles.upValue}>{upText}</Text>
      <Text style={styles.toPlayValue}>{toPlayText}</Text>
    </View>
  );
}

// Team names default to a longish "Nassau Team 1" / "Match Play Team 1" and
// can be renamed to anything by the user - these status pills are tiny, so
// strip the redundant bet-type prefix and cap the length rather than let a
// long name run off the edge of the screen.
function shortTeamLabel(label: string): string {
  const stripped = label.replace(/^(Nassau|Match Play)\s+/i, '');
  return stripped.length > 10 ? `${stripped.slice(0, 9)}\u2026` : stripped;
}

function segmentPillText(segment: NassauSegmentState, labelA: string, labelB: string): string {
  if (segment.holesPlayed === 0) return '-';
  if (segment.status === 0) return 'AS';
  const label = shortTeamLabel(segment.status > 0 ? labelA : labelB);
  return `${label} +${Math.abs(segment.status)}`;
}

// Comma-separated player names for a side, in team order - lets a card show
// who's actually on "Team 1" without needing to open the detail modal.
function rosterNames(playerIds: string[], players: Player[]): string {
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  return playerIds.map((id) => nameById.get(id) ?? '?').join(', ');
}

function MatchupCard({
  matchup,
  players,
  divider,
  totalHoles,
  onPress,
}: {
  matchup: NassauMatchup;
  players: Player[];
  divider: boolean;
  totalHoles: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.matchup, divider && styles.matchupDivider]} onPress={onPress}>
      <Text
        style={styles.matchupTitle}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {matchup.labelA} vs {matchup.labelB}
      </Text>
      <Text style={styles.roster} numberOfLines={1}>
        {matchup.labelA}: {rosterNames(matchup.playerIdsA, players)}
      </Text>
      <Text style={styles.roster} numberOfLines={1}>
        {matchup.labelB}: {rosterNames(matchup.playerIdsB, players)}
      </Text>
      {describeSegment('Front', matchup.front, matchup.labelA, matchup.labelB, NASSAU_HALF_HOLES)}
      {/* A 9-hole round has no back nine, and "overall" is identical to
          "front" - just clutter, so both are skipped. */}
      {totalHoles > 9 &&
        describeSegment('Back', matchup.back, matchup.labelA, matchup.labelB, NASSAU_HALF_HOLES)}
      {totalHoles > 9 &&
        describeSegment('Overall', matchup.overall, matchup.labelA, matchup.labelB, totalHoles)}
    </Pressable>
  );
}

// Read-only hole-by-hole detail for one Match Play matchup - each side's
// best-ball score on every hole, with the winning side's cell highlighted
// so the front/back/overall result is traceable back to the holes that
// actually decided it.
function MatchPlayMatchupDetailModal({
  visible,
  matchup,
  totalHoles,
  onClose,
}: {
  visible: boolean;
  matchup: NassauMatchup | null;
  totalHoles: number;
  onClose: () => void;
}) {
  if (!matchup) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={detailStyles.backdrop} onPress={onClose} />
      <View style={detailStyles.sheet}>
        <Text
          style={detailStyles.title}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
        >
          {matchup.labelA} vs {matchup.labelB}
        </Text>
        <Text style={detailStyles.subtitle}>Read-only - hole wins highlighted</Text>

        <View style={detailStyles.pillRow}>
          <View style={detailStyles.pill}>
            <Text style={detailStyles.pillLabel}>F</Text>
            <Text style={detailStyles.pillText}>
              {segmentPillText(matchup.front, matchup.labelA, matchup.labelB)}
            </Text>
          </View>
          {matchup.back.holesPlayed > 0 && (
            <View style={detailStyles.pill}>
              <Text style={detailStyles.pillLabel}>B</Text>
              <Text style={detailStyles.pillText}>
                {segmentPillText(matchup.back, matchup.labelA, matchup.labelB)}
              </Text>
            </View>
          )}
          {totalHoles > 9 && (
            <View style={detailStyles.pill}>
              <Text style={detailStyles.pillLabel}>O</Text>
              <Text style={detailStyles.pillText}>
                {segmentPillText(matchup.overall, matchup.labelA, matchup.labelB)}
              </Text>
            </View>
          )}
        </View>

        <View style={detailStyles.grid}>
          <View style={detailStyles.stickyCol}>
            <View style={detailStyles.cell}>
              <Text style={detailStyles.stickyHeaderText}>Hole</Text>
            </View>
            <View style={detailStyles.cell}>
              <Text style={detailStyles.stickyText} numberOfLines={1}>
                {matchup.labelA}
              </Text>
            </View>
            <View style={detailStyles.cell}>
              <Text style={detailStyles.stickyText} numberOfLines={1}>
                {matchup.labelB}
              </Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={detailStyles.row}>
                {matchup.holes.map((h) => (
                  <View style={detailStyles.gridCell} key={h.hole}>
                    <Text style={detailStyles.headerText}>{h.hole}</Text>
                  </View>
                ))}
              </View>
              <View style={detailStyles.row}>
                {matchup.holes.map((h) => (
                  <View
                    key={h.hole}
                    style={[detailStyles.gridCell, h.winner === 'a' && detailStyles.winCell]}
                  >
                    <Text style={[detailStyles.scoreText, h.winner === 'a' && detailStyles.winText]}>
                      {h.scoreA ?? '-'}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={detailStyles.row}>
                {matchup.holes.map((h) => (
                  <View
                    key={h.hole}
                    style={[detailStyles.gridCell, h.winner === 'b' && detailStyles.winCell]}
                  >
                    <Text style={[detailStyles.scoreText, h.winner === 'b' && detailStyles.winText]}>
                      {h.scoreB ?? '-'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>

        <Pressable style={detailStyles.closeButton} onPress={onClose}>
          <Text style={detailStyles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export default function MatchPlayStatus({ matchPlay, players, totalHoles }: MatchPlayStatusProps) {
  const [selected, setSelected] = useState<NassauMatchup | null>(null);

  if (matchPlay.length === 0) {
    const hint = players.length < 2 ? 'Add 2+ players to track Match Play' : 'No Match Play teams yet';
    return (
      <View style={styles.container}>
        <View style={styles.headerBar}>
          <Text style={styles.headerBarText}>MATCH PLAY</Text>
        </View>
        <Text style={[styles.hint, styles.content]}>{hint}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerBarText}>MATCH PLAY</Text>
      </View>
      <View style={styles.content}>
        {matchPlay.map((matchup, index) => (
          <MatchupCard
            key={`${matchup.idA}|${matchup.idB}`}
            matchup={matchup}
            players={players}
            divider={index > 0}
            totalHoles={totalHoles}
            onPress={() => setSelected(matchup)}
          />
        ))}
      </View>

      <MatchPlayMatchupDetailModal
        visible={selected !== null}
        matchup={selected}
        totalHoles={totalHoles}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e6ea',
  },
  headerBar: {
    backgroundColor: '#16513a',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  headerBarText: {
    color: '#dcefe3',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  content: {
    padding: 12,
  },
  hint: {
    color: '#556',
  },
  matchup: {
    marginBottom: 4,
  },
  matchupDivider: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#d7e6fa',
  },
  matchupTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#234',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  labelWrap: {
    width: 70,
    position: 'relative',
  },
  label: {
    fontWeight: '500',
  },
  sticker: {
    position: 'absolute',
    top: -9,
    left: -6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    transform: [{ rotate: '-9deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 1.5,
    elevation: 2,
  },
  stickerDormie: {
    backgroundColor: '#b5730a',
  },
  stickerClosed: {
    backgroundColor: '#b3261e',
  },
  stickerText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.4,
  },
  statusName: {
    flex: 1,
    textAlign: 'left',
  },
  upValue: {
    width: 48,
    textAlign: 'right',
  },
  toPlayValue: {
    width: 88,
    textAlign: 'right',
  },
  roster: {
    fontSize: 12,
    color: '#667',
    marginBottom: 2,
  },
});

const detailStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
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
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: '#889',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef6ff',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#889',
    marginRight: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#234',
  },
  grid: {
    flexDirection: 'row',
  },
  stickyCol: {
    width: 88,
  },
  cell: {
    height: 36,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stickyHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
  },
  stickyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  row: {
    flexDirection: 'row',
  },
  gridCell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    borderLeftWidth: 1,
    borderLeftColor: '#f3f3f3',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#234',
  },
  winCell: {
    backgroundColor: '#eaf7ee',
  },
  winText: {
    color: '#1a7f37',
    fontWeight: '700',
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeButtonText: {
    color: '#556',
    fontWeight: '600',
  },
});
