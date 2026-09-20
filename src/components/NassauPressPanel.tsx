import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  NassauMatchup,
  NassauSegmentState,
  NassauPressResult,
  NassauSegmentKey,
  PressStackingMode,
  NASSAU_HALF_HOLES,
  nassauSegmentRange,
} from '../state/useRoundState';

interface NassauPressPanelProps {
  matchups: NassauMatchup[];
  totalHoles: number;
  nassauPressResults: NassauPressResult[];
  currentHole: number;
  pressStacking: PressStackingMode;
  submittedPlayerIds: Set<string>;
  onCallPress: (matchupKey: string, segment: NassauSegmentKey) => void;
}

// Lives on the Score tab rather than the Leaderboard because a press only
// makes sense in the context of "what hole are we on right now" - and
// since Nassau matchups can no longer span tee groups, the Score tab
// already has exactly the one matchup (if any) that's relevant to whoever
// is looking at it, with no cross-group timing ambiguity to worry about.
// The Leaderboard's NassauStatus still shows every matchup's standings
// round-wide; this panel is just the live, actionable piece.
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
    if (segment.closed) {
      status = 'closed';
    } else if (toPlay > 0 && margin === toPlay) {
      status = 'dormie';
    }
  }

  return (
    <View style={styles.row} key={label}>
      <View style={styles.labelWrap}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
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

function pressesFor(
  pressResults: NassauPressResult[],
  matchupKey: string,
  segment: NassauSegmentKey
): NassauPressResult[] {
  return pressResults.filter((press) => press.matchupKey === matchupKey && press.segment === segment);
}

// The "+ Press" button shows when the segment is actually in progress
// (current hole falls within its range), single-stacking hasn't already
// capped it, and whoever's currently down in the latest window (newest
// press, or the base segment) is genuinely down - and never once either
// side's tee group has submitted, since there's nothing left to press.
function canPressSegment(
  segment: NassauSegmentKey,
  baseState: NassauSegmentState,
  presses: NassauPressResult[],
  totalHoles: number,
  currentHole: number,
  stacking: PressStackingMode,
  locked: boolean
): boolean {
  if (locked) return false;
  if (stacking === 'none') return false;
  const range = nassauSegmentRange(segment, totalHoles);
  if (!range) return false;
  if (currentHole < range.start || currentHole > range.end) return false;
  if (stacking === 'single' && presses.length > 0) return false;
  const active = presses.length > 0 ? presses[presses.length - 1] : null;
  const state = active ? active.state : baseState;
  return state.holesPlayed > 0 && state.status !== 0;
}

const SEGMENT_KEYS: NassauSegmentKey[] = ['front', 'back', 'overall'];
const SEGMENT_LABELS: Record<NassauSegmentKey, string> = {
  front: 'Front',
  back: 'Back',
  overall: 'Overall',
};

function MatchupPressCard({
  matchup,
  divider,
  totalHoles,
  nassauPressResults,
  currentHole,
  pressStacking,
  submittedPlayerIds,
  onCallPress,
}: {
  matchup: NassauMatchup;
  divider: boolean;
  totalHoles: number;
  nassauPressResults: NassauPressResult[];
  currentHole: number;
  pressStacking: PressStackingMode;
  submittedPlayerIds: Set<string>;
  onCallPress: (matchupKey: string, segment: NassauSegmentKey) => void;
}) {
  const matchupKey = `${matchup.idA}|${matchup.idB}`;
  const locked =
    matchup.playerIdsA.some((id) => submittedPlayerIds.has(id)) ||
    matchup.playerIdsB.some((id) => submittedPlayerIds.has(id));

  return (
    <View style={[styles.matchup, divider && styles.matchupDivider]}>
      <Text
        style={styles.matchupTitle}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {matchup.labelA} vs {matchup.labelB}
      </Text>

      {/* A 9-hole round has no back nine, and "overall" is identical to
          "front" - just clutter, so only front shows. */}
      {(totalHoles === 9 ? (['front'] as NassauSegmentKey[]) : SEGMENT_KEYS).map((segmentKey) => {
        const baseState = matchup[segmentKey];
        const required = segmentKey === 'overall' ? totalHoles : NASSAU_HALF_HOLES;
        const presses = pressesFor(nassauPressResults, matchupKey, segmentKey);
        const eligible = canPressSegment(
          segmentKey,
          baseState,
          presses,
          totalHoles,
          currentHole,
          pressStacking,
          locked
        );
        return (
          <View key={segmentKey}>
            {describeSegment(SEGMENT_LABELS[segmentKey], baseState, matchup.labelA, matchup.labelB, required)}
            {presses.map((press) => (
              <View style={styles.pressIndent} key={press.id}>
                {describeSegment(
                  `${press.source === 'auto' ? 'Auto-' : ''}Press (h${press.startHole})`,
                  press.state,
                  matchup.labelA,
                  matchup.labelB,
                  press.endHole - press.startHole + 1
                )}
              </View>
            ))}
            {eligible && (
              <Pressable style={styles.pressButton} onPress={() => onCallPress(matchupKey, segmentKey)}>
                <Text style={styles.pressButtonText}>{'+ Press'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

export default function NassauPressPanel({
  matchups,
  totalHoles,
  nassauPressResults,
  currentHole,
  pressStacking,
  submittedPlayerIds,
  onCallPress,
}: NassauPressPanelProps) {
  if (matchups.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerBarText}>NASSAU</Text>
      </View>
      <View style={styles.content}>
        {matchups.map((matchup, index) => (
          <MatchupPressCard
            key={`${matchup.idA}|${matchup.idB}`}
            matchup={matchup}
            divider={index > 0}
            totalHoles={totalHoles}
            nassauPressResults={nassauPressResults}
            currentHole={currentHole}
            pressStacking={pressStacking}
            submittedPlayerIds={submittedPlayerIds}
            onCallPress={onCallPress}
          />
        ))}
      </View>
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
    width: 60,
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
  pressIndent: {
    marginLeft: 14,
    opacity: 0.85,
  },
  pressButton: {
    alignSelf: 'flex-start',
    marginLeft: 14,
    marginTop: 2,
    marginBottom: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#eef8f0',
    borderWidth: 1,
    borderColor: '#1a7f37',
  },
  pressButtonText: {
    color: '#1a7f37',
    fontSize: 11,
    fontWeight: '700',
  },
});
