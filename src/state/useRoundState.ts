import { create } from 'zustand';
import {
  ref,
  set as dbSet,
  update as dbUpdate,
  get as dbGet,
  push,
  onValue,
  remove as dbRemove,
} from '@firebase/database';
import { db, auth, ensureSignedIn } from '../lib/firebase';
import { generateRoundCode } from '../lib/roundCode';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------- Types ----------

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
}

// Gross score per hole per player: { [holeNumber]: { [playerId]: strokes } }
export type HoleScores = Record<number, Record<string, number>>;

export interface HoleInfo {
  par: number;
  handicapIndex: number;
}

// Course info per hole - shared by the whole round (every group plays the
// same course), usually filled in from a scanned scorecard.
export type HolesInfo = Record<number, HoleInfo>;

export interface Team {
  id: string;
  name: string;
  createdAt: number;
}

// Which team (if any) each player belongs to: { [playerId]: teamId }. A
// player with no entry here doesn't take part in Nassau at all - they're
// simply not matched against anyone (their individual stroke score is
// still tracked separately). This is round-level, not per tee group - a
// bet team can pair players who are on different tees together, since who
// you play with and who you bet with don't have to be the same.
export type PlayerTeams = Record<string, string>;

// Each player's handicap, as a whole number of strokes to allocate across
// the round (not a course-specific decimal index - the group already knows
// what number to use). Missing entry means scratch (0 strokes). Round-level,
// same as bet teams.
export type PlayerHandicaps = Record<string, number>;

export interface NassauSegmentState {
  // Positive = side A is up by that many holes, negative = side B is up
  status: number;
  holesPlayed: number;
  // True once the leading side's margin can no longer be caught in this
  // segment (a "closed out" match, e.g. 3&2) - a historical fact, so once
  // set it stays true even after the rest of the segment's holes get
  // filled in for the other bets that share this same score data.
  closed: boolean;
  // The hole number that first made `closed` true, or null if it isn't.
  // Lets a "this bet just closed" notice show only on the hole where it
  // actually happened, rather than on every hole afterward.
  closedAtHole: number | null;
}

// One matchup's result on a single hole - each side's best-ball score
// (already the low score among a team's players) and who won it. null
// scores/winner mean the hole isn't fully played by both sides yet.
export interface NassauHoleResult {
  hole: number;
  scoreA: number | null;
  scoreB: number | null;
  winner: 'a' | 'b' | 'tie' | null;
}

export interface NassauMatchup {
  idA: string;
  idB: string;
  labelA: string;
  labelB: string;
  // Every player on each side - needed to settle a matchup player-by-player
  // even when a side is a multi-player team.
  playerIdsA: string[];
  playerIdsB: string[];
  front: NassauSegmentState;
  back: NassauSegmentState;
  overall: NassauSegmentState;
  holes: NassauHoleResult[];
}

// One matchup per unique pair of "sides" (round-robin) - a side is a team if
// players have been grouped into one, otherwise each ungrouped player is
// their own side. Computed round-wide, across every tee group.
export type NassauState = NassauMatchup[];

// Dollar amount per Nassau segment - the traditional "$2-$2-$4" style bet.
// Round-level, since Nassau itself is a single round-wide bet (unlike
// Skins, which supports several independent bets).
export interface NassauAmounts {
  front: number;
  back: number;
  overall: number;
}

export type NassauSegmentKey = 'front' | 'back' | 'overall';

export type PressStackingMode = 'none' | 'single' | 'unlimited';

// Whether a round's bets are denominated in money or in drinks bought at
// the 19th hole - purely a display/labeling choice; the underlying bet
// amounts and settlement math are identical either way, a "drink" is
// just a different unit of account than a dollar.
export type StakesUnit = 'money' | 'drinks';

export function stakesSymbol(unit: StakesUnit): string {
  return unit === 'drinks' ? '\uD83C\uDF7A' : '$';
}

// e.g. formatStakeAmount(5, 'money') -> "$5", formatStakeAmount(5, 'drinks') -> "5 \uD83C\uDF7A"
export function formatStakeAmount(amount: number, unit: StakesUnit): string {
  return unit === 'drinks' ? `${amount} \uD83C\uDF7A` : `$${amount}`;
}

// e.g. stakeFieldLabel('Bet', 'money') -> "Bet $", stakeFieldLabel('Bet', 'drinks') -> "Bet \uD83C\uDF7A"
export function stakeFieldLabel(base: string, unit: StakesUnit): string {
  return `${base} ${stakesSymbol(unit)}`;
}

// A manually-called press - who called it, which matchup/segment, and the
// hole it starts from. Never edited once written, same as a scored hole -
// a press either happened or it didn't. Auto-presses (see nassauAutoPress)
// are never persisted like this - they're a pure function of the scores
// and the round's press settings, so every viewer computes the same ones
// without waiting on a write to land.
export interface NassauPressCall {
  id: string;
  matchupKey: string;
  segment: NassauSegmentKey;
  startHole: number;
  calledBy: string;
  createdAt: number;
}

// One active press - a same-stakes side bet layered on top of a Front
// 9/Back 9/Overall bet, running in parallel from wherever it started to
// that segment's own end. Computed exactly like a base segment (see
// NassauSegmentState), just over its own hole range - it never replaces or
// pauses the bet it presses, both keep paying out independently.
export interface NassauPressResult {
  id: string;
  matchupKey: string;
  segment: NassauSegmentKey;
  segmentName: string;
  startHole: number;
  endHole: number;
  source: 'manual' | 'auto';
  state: NassauSegmentState;
}

export interface SkinsPlayerTotal {
  id: string;
  label: string;
  skinsWon: number;
}

// One independent Skins pool - its own name, its own opted-in players, and
// its own carryover rule. A player can be opted into more than one Skins
// bet at once (unlike Nassau teams, where a player is on at most one team
// per bet), so this is a flat player list rather than an exclusive
// assignment. Round-level, not per tee group - same as bet teams.
// How a Skins bet turns skins won into money. 'perSkin' is the classic
// game: a fixed dollar amount changes hands for every skin, paid directly
// between players. 'pot' is a buy-in game instead: every eligible player
// antes the same amount up front regardless of outcome, and that pot is
// split across however many skins actually got won over the round, paid
// out per skin - so the payout per skin isn't fixed, it depends on how
// many skins end up being won.
export type SkinsPayoutMode = 'perSkin' | 'pot';

export interface SkinsBet {
  id: string;
  name: string;
  carryover: boolean;
  // Whether this bet settles on net score (after handicap strokes) or
  // gross. Each Skins bet has its own setting, same as its own carryover
  // rule - one round can mix net and gross bets.
  net: boolean;
  payoutMode: SkinsPayoutMode;
  // Dollar value of one skin - only used when payoutMode is 'perSkin'.
  // 0 means no money attached yet.
  valuePerSkin: number;
  // Per-player buy-in into the pot - only used when payoutMode is 'pot'.
  // 0 means no money attached yet.
  buyIn: number;
  // Whether this bet's amounts are shown/settled in money or in drinks -
  // each bet picks its own unit, independent of every other bet in the
  // round.
  unit: StakesUnit;
  createdAt: number;
  playerIds: string[];
}

// One Skins bet's result on a single hole. `winnerId` is set only on the
// hole where a pot actually gets awarded (a single low score, possibly
// carrying skins in from earlier tied holes) - a tied hole leaves it null
// even though `tied` is true. `resolved` false means it isn't fully played
// yet by every eligible player.
export interface SkinsHoleResult {
  hole: number;
  scores: Record<string, number | null>;
  winnerId: string | null;
  skinsAwarded: number;
  tied: boolean;
  resolved: boolean;
}

export interface SkinsBetResult {
  betId: string;
  name: string;
  carryover: boolean;
  totals: SkinsPlayerTotal[];
  // Skins riding on unresolved ties, not yet won by anyone.
  pendingSkins: number;
  holesResolved: number;
  holes: SkinsHoleResult[];
}

// One result per Skins bet in the round - there can be any number of them,
// and they're computed independently of each other even when they share
// players. Computed round-wide, across every tee group, same as Nassau.
export type SkinsState = SkinsBetResult[];

export interface BirdiesPlayerTotal {
  id: string;
  label: string;
  // Strokes-under-par earned across the round: a birdie is worth 1, an
  // eagle 2, an albatross 3, and so on - so a player's eagle is worth
  // exactly twice what a birdie is in the flat per-point payout below,
  // without needing a special case for it.
  points: number;
}

// One independent Birdies pool - own name, own opted-in players, own
// net-scoring setting, own dollar value. Same shape as a Skins bet
// (playerIds is a flat list, not an exclusive team), minus carryover and
// the pot payout mode - Birdies only ever pays flat, per point, the
// moment it's earned.
export interface BirdiesBet {
  id: string;
  name: string;
  net: boolean;
  // Dollar value of one point (one stroke under par) - every other
  // eligible player pays this per point the birdie-maker earns. 0 means
  // no money attached yet.
  amountPerBirdie: number;
  unit: StakesUnit;
  createdAt: number;
  playerIds: string[];
}

// One Birdies bet's result on a single hole. `scorers` only lists
// eligible players who actually scored birdie-or-better that hole, with
// how many points it's worth - everyone else on the hole simply isn't in
// this map. `resolved` false means it isn't fully played yet by every
// eligible player.
export interface BirdiesHoleResult {
  hole: number;
  scores: Record<string, number | null>;
  scorers: Record<string, number>;
  resolved: boolean;
}

export interface BirdiesBetResult {
  betId: string;
  name: string;
  totals: BirdiesPlayerTotal[];
  holesResolved: number;
  holes: BirdiesHoleResult[];
}

// One result per Birdies bet in the round, same pattern as SkinsState.
export type BirdiesState = BirdiesBetResult[];

export interface DoublesPlayerTotal {
  id: string;
  label: string;
  // Number of holes this player scored double bogey or worse on.
  doubleCount: number;
}

// One independent Doubles pool - the mirror image of Birdies: instead of
// paying out for a good hole, every eligible player who scores double
// bogey or worse on a hole pays every other eligible player a flat amount
// for it, regardless of what anyone else scored that hole. Same shape as
// a Birdies bet otherwise.
export interface DoublesBet {
  id: string;
  name: string;
  net: boolean;
  // Dollar value of one double-bogey-or-worse hole - paid to every other
  // eligible player. 0 means no money attached yet.
  amountPerDouble: number;
  unit: StakesUnit;
  createdAt: number;
  playerIds: string[];
}

// One Doubles bet's result on a single hole. `doubledIds` lists eligible
// players who scored double bogey or worse that hole (there can be more
// than one). `resolved` false means it isn't fully played yet by every
// eligible player.
export interface DoublesHoleResult {
  hole: number;
  scores: Record<string, number | null>;
  doubledIds: string[];
  resolved: boolean;
}

export interface DoublesBetResult {
  betId: string;
  name: string;
  totals: DoublesPlayerTotal[];
  holesResolved: number;
  holes: DoublesHoleResult[];
}

// One result per Doubles bet in the round, same pattern as SkinsState.
export type DoublesState = DoublesBetResult[];

// How a Stroke Play bet turns the round's final scores into money.
// 'perStroke' pays the outright winner (lowest score) a flat $ amount for
// every stroke they beat each other entrant by - no buy-in, just the
// winner collecting their margin from everyone else. Nothing changes
// hands between two non-winning entrants. 'potWinner' is a buy-in game -
// every entrant antes the same amount, and the whole pot goes to the
// lowest score (split if tied for the lead). 'potFinish' is also a
// buy-in game, but the pot is divided across the field by finish
// position instead of winner-take-all - a better finish earns a bigger
// share.
export type StrokePlayPayoutMode = 'perStroke' | 'potWinner' | 'potFinish';

export interface StrokePlayBet {
  id: string;
  name: string;
  // Whether this bet settles on net score (after handicap strokes) or
  // gross - same per-bet setting as Skins and Nassau.
  net: boolean;
  payoutMode: StrokePlayPayoutMode;
  // Dollar value of one stroke of margin - only used when payoutMode is
  // 'perStroke'. 0 means no money attached yet.
  valuePerStroke: number;
  // Per-player buy-in into the pot - only used when payoutMode is
  // 'potWinner' or 'potFinish'. 0 means no money attached yet.
  buyIn: number;
  // Same per-bet unit setting as Skins - see SkinsBet.unit.
  unit: StakesUnit;
  createdAt: number;
  playerIds: string[];
}

export interface StrokePlayPlayerTotal {
  id: string;
  label: string;
  toPar: number;
  holesPlayed: number;
}

// One Stroke Play bet's standings, sorted best (lowest toPar) to worst.
// `resolved` is true only once every entrant has played the whole round -
// standings are visible live as scores come in, but nothing settles until
// then, since a mid-round total isn't a real result yet.
export interface StrokePlayBetResult {
  betId: string;
  name: string;
  totals: StrokePlayPlayerTotal[];
  resolved: boolean;
}

// One result per Stroke Play bet in the round, computed independently of
// each other, same as Skins.
export type StrokePlayState = StrokePlayBetResult[];

// One bet's contribution to a player's final settlement number - "Nassau
// Front 9 vs Team 2", "Skins 1", "Stroke Play 1", etc. Positive/negative
// follows the same sign convention as SettlementEntry.amount, so the
// breakdown always sums back to it.
export interface SettlementLineItem {
  label: string;
  amount: number;
}

export interface SettlementEntry {
  id: string;
  label: string;
  // Positive = this player is owed money overall; negative = they owe.
  amount: number;
  // Every line item that added up to `amount`, in settlement order (Nassau,
  // then Match Play, then Skins, then Stroke Play) - lets the UI show a
  // player exactly how their total was reached instead of just the number.
  breakdown: SettlementLineItem[];
}

// Final $ owed per player, net across every settled Nassau segment and
// every Skins bet in the round. A segment only contributes once it's fully
// played out (a tie contributes nothing either way).
export type Settlement = SettlementEntry[];

// One player's result within a single bet card - same money already
// counted in that player's SettlementEntry, just organized by bet instead
// of by player.
export interface BetCardRow {
  playerId: string;
  label: string;
  amount: number;
}

// A settled bet (or, for Nassau/Match Play, one segment of one matchup),
// with every player's result for it in one place. Built alongside the
// per-player breakdown from the exact same numbers, so the "Bets" and
// "Pots" views can never drift from what players actually see on their
// own totals. `isPot` marks the bets built on a shared buy-in pot (Skins
// pot mode, Stroke Play potWinner/potFinish) - the ones where seeing the
// whole distribution at once matters most.
export interface BetCard {
  key: string;
  category: 'Nassau' | 'Match Play' | 'Skins' | 'Stroke Play' | 'Birdies' | 'Doubles';
  title: string;
  isPot: boolean;
  rows: BetCardRow[];
}

// A saved course - hole-by-hole par/handicap index plus how many holes it
// plays, entered once (scanned or typed) and reused at setup for the next
// round played there instead of starting from scratch every time. Shared
// across everyone using the app: whoever saves a course first saves
// everyone else the trouble of re-entering it. Immutable once created (see
// database.rules.json) - no in-place edits, just new entries.
// A single tee set's rating info off a scorecard - course rating, slope
// rating, and total yardage played from that tee. Purely informational:
// nothing in the app computes differently based on these (handicaps are
// entered as flat whole-stroke numbers per player, not derived from course
// rating/slope) - they're stored so the course library can show real
// scorecard numbers, and so a player can eyeball which tee they play.
export interface TeeInfo {
  name: string;
  rating: number;
  slope: number;
  yardage: number;
}

export interface CourseInfo {
  id: string;
  name: string;
  totalHoles: number;
  holes: HolesInfo;
  tees?: TeeInfo[];
  // A short caveat about this entry's data quality or source, e.g. a note
  // that rating/slope conflicted across sources - shown in the course
  // picker so pre-loaded reference data is never mistaken for a verified
  // guarantee. Optional; most user-saved courses won't have one.
  notes?: string;
  createdBy: string;
  createdAt: number;
}

// Where a player's handicap18 number actually comes from - purely
// informational (nothing in the app computes differently based on this),
// so a tee group can judge how official the number is at a glance.
export type HandicapType = 'ghin' | 'league' | 'usga_like' | 'best_guess';

// A sane upper bound on any handicap entered anywhere in the app - guards
// against a fat-fingered extra digit (e.g. "110" instead of "11") rather
// than reflecting any real rule about who can play.
export const MAX_HANDICAP = 36;

// Every player entry in a round is keyed one of exactly two ways: a real
// device's own Firebase Auth uid (createRound/joinGroup/createGroupAndJoin/
// claimPlayer, never starts with "-"), or a Firebase push() key from
// addPlayer/addRegularPlayer for a name-only player with no device
// (always starts with "-"). That's a reliable enough signal to offer "That's
// me" only on the entries nobody's device has claimed yet, without adding
// a separate flag to track it.
export function isUnclaimedPlayerId(playerId: string): boolean {
  return playerId.startsWith('-');
}

// Short, easy-to-say words used to tell apart two players who typed the
// same name into the same round (two "Jim"s is the whole reason this
// exists) - picked for being quick to read out loud mid-round ("wait,
// which Jim - Fox or Otter?") rather than for being a real roster of
// anything.
const NAME_DISAMBIGUATION_WORDS = [
  'Fox', 'Bear', 'Wolf', 'Hawk', 'Otter', 'Owl', 'Elk', 'Lynx', 'Heron',
  'Falcon', 'Badger', 'Moose', 'Raven', 'Puma', 'Eagle', 'Bison', 'Marlin',
  'Gator', 'Cobra', 'Stag',
];

// Given every player name already in the round and the name someone's
// about to be added under, returns a name that's guaranteed not to
// collide: the name as-is if nothing else in the round has it, otherwise
// "<name>-<Word>" with a word picked at random from
// NAME_DISAMBIGUATION_WORDS (skipping any word already used for this
// same base name in the round, so two "Jim"s never both end up
// "Jim-Fox"). Comparison is case-insensitive so "Jim" and "jim" still
// collide.
function dedupePlayerName(existingNames: string[], requestedName: string): string {
  const trimmed = requestedName.trim();
  const lower = trimmed.toLowerCase();
  const isTaken = existingNames.some((name) => name.trim().toLowerCase() === lower);
  if (!isTaken) return trimmed;

  const suffixPattern = new RegExp(`^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-([A-Za-z]+)$`, 'i');
  const usedWords = new Set(
    existingNames
      .map((name) => name.match(suffixPattern)?.[1]?.toLowerCase())
      .filter((word): word is string => word != null)
  );
  const available = NAME_DISAMBIGUATION_WORDS.filter((word) => !usedWords.has(word.toLowerCase()));
  const pool = available.length > 0 ? available : NAME_DISAMBIGUATION_WORDS;
  const word = pool[Math.floor(Math.random() * pool.length)];
  return `${trimmed}-${word}`;
}

// Flattens every player name already in the round, across every tee
// group, from a live rounds/$code/groups snapshot value (used right
// before a write that's about to introduce a new name, so it always
// sees the latest data rather than whatever's cached locally).
function allPlayerNamesInGroupsSnapshot(
  groupsValue: Record<string, { players?: Record<string, { name: string }> }> | null | undefined
): string[] {
  const names: string[] = [];
  for (const group of Object.values(groupsValue ?? {})) {
    for (const player of Object.values(group.players ?? {})) {
      if (player?.name) names.push(player.name);
    }
  }
  return names;
}

// A player's own saved display name and 18-hole handicap, so neither has
// to be retyped on every "Start a Match"/"Join a Match" screen or round
// setup. Private to that player's own auth uid. handicap18 is always the
// full 18-hole number - anything that needs a 9-hole value halves it at
// the point of use instead of storing two numbers that could drift apart.
export interface PlayerProfile {
  displayName: string;
  handicap18: number | null;
  handicapType: HandicapType | null;
  updatedAt: number;
  // Never settable from the app (database.rules.json denies writes to
  // this field entirely) - flipped to true by hand in the Firebase
  // console, once, on whichever player node is actually mine. That's
  // what the Admin menu entry and feedback inbox are gated on.
  isAdmin: boolean;
}

// The payment apps a player can list a handle for on their profile, used
// to build "pay via X" deep links on the Settlement screen's payout plan.
// Zelle gets its own field (unlike a generic "other") because it's common
// enough to deserve first-class prefilled support even though it has no
// public handle or deep link of its own - just a phone/email shown for
// manual entry in whatever bank app the payer already uses.
export type PaymentApp = 'venmo' | 'paypal' | 'cashapp' | 'zelle' | 'other';

// A player's own saved payment handles for settling bets with other
// players after a round. Broadly readable (any signed-in user) since a
// handle isn't sensitive and needs to be visible to whoever owes this
// player money in a round; only the owning uid can ever write its own
// node (see database.rules.json's paymentHandles rules).
export interface PaymentHandles {
  venmo: string | null;
  paypal: string | null;
  cashapp: string | null;
  // Phone or email, for display/manual entry only - Zelle has no public
  // handle format and nothing to deep-link to.
  zelle: string | null;
  otherLabel: string | null;
  otherValue: string | null;
  updatedAt: number;
}

// Whether a single payout-plan transaction (see PayoutTransaction in
// SettlementScreen.tsx, keyed the same way as this entry: `${fromId}_${toId}`)
// has actually been settled. Two independent confirmations, each writable
// by only one side (enforced in database.rules.json) - the payer marks
// money as sent, the payee marks it as received, and neither can toggle
// the other's flag for them.
export interface PayoutStatusEntry {
  sentByPayer: boolean;
  sentAt: number | null;
  confirmedByPayee: boolean;
  confirmedAt: number | null;
}

// One thing a player sent in from the feedback box on Welcome. Only
// readable by whichever profile has isAdmin set (see database.rules.json) -
// everyone can write one, nobody but the admin can read the list back.
export interface FeedbackEntry {
  id: string;
  text: string;
  byUid: string;
  byName: string | null;
  createdAt: number;
}

// One bet's contribution to a player's history entry - same shape as
// SettlementLineItem, plus which kind of bet it was, since a career
// breakdown by bet type is only possible if that's recorded at the time.
export interface HistoryBreakdownItem {
  category: BetCard['category'];
  label: string;
  amount: number;
}

// Whether this player's tee shot ended up in the fairway on a hole where
// that stat applies (par 4s/5s only - a par 3 is played to the green,
// not a fairway, so it's left null rather than forced into hit/miss).
export type FairwayResult = 'hit' | 'miss';

// This player's own fairway/green/putts line for one hole - private,
// never shown to anyone else in the round. gir (green in regulation) is
// computed, not tapped: strokes taken to reach the green (this hole's
// score minus putts) at or under par minus 2, the standard definition -
// see setHoleStat.
export interface HoleStat {
  fairway: FairwayResult | null;
  putts: number | null;
  gir: boolean;
}

// One past round's result for the signed-in player, written automatically
// (by their own device, to their own private history) once that round's
// bets are all closed. This is the only place a round's money outcome is
// durably recorded anywhere - the live Settlement screen is purely a
// client-side computation that vanishes once everyone leaves the round.
// holeStats, if present, is this player's own fairway/green/putts logging
// for that round (see setHoleStat) - written live, hole by hole, during
// play, so it already exists by the time this entry's summary fields are
// merged in at round-close and is never overwritten by that merge.
export interface HistoryEntry {
  roundCode: string;
  date: number;
  courseName: string | null;
  totalHoles: number;
  opponentNames: string[];
  amount: number;
  breakdown: HistoryBreakdownItem[];
  holeStats?: Record<number, HoleStat>;
}

// A full re-fetch of one past round's data by its roundCode, built for the
// History "View Round" screen. Unlike the live round in the main store
// (roundCode/groups/settlement/etc. above), this never touches that state
// and is never subscribed live except for payoutStatus - everything else
// about a closed-out round is frozen, so one dbGet is enough. rounds/
// {roundCode} is never deleted, so this works for any round still on
// record, including ones from before this screen existed.
export interface HistoricalRoundView {
  roundCode: string;
  courseName: string | null;
  totalHoles: number;
  createdAt: number | null;
  holes: HolesInfo;
  groups: Group[];
  handicaps: PlayerHandicaps;
  settlement: Settlement;
  betCards: BetCard[];
  payoutStatus: Record<string, PayoutStatusEntry>;
}

// Anyone this player has completed a round with, remembered automatically
// (see recordRegulars) so setting up a new round with the usual group
// doesn't mean retyping names and re-guessing handicaps every time.
// Player-scoped, not round-scoped - same load-on-demand pattern as
// profile/history. Keyed by a normalized form of the name (see
// regularKeyFor) so playing with "Steve" again updates the same entry
// instead of piling up duplicates.
export interface RegularPlayer {
  name: string;
  handicap18: number | null;
  lastPlayedAt: number;
}

// A round is one outing that can contain several tee groups (whoever's
// actually playing together on the course, whatever size that group is)
// under the same round code. Score ENTRY is isolated per tee group -
// enforced by the Firebase security rules, not just hidden in the UI - so
// the group behind you on the course can see your progress on the shared
// leaderboard but can never touch your scores. Bet teams (Nassau, etc.) are
// separate from tee groups entirely and live at the round level, since who
// you're paired with for a bet doesn't have to match who you're playing
// alongside.
export interface Group {
  id: string;
  name: string;
  createdAt: number;
  players: Player[];
  scores: HoleScores;
  // Set once the group's players confirm their card is complete (after the
  // last hole). Purely informational - scores can still be corrected after
  // submitting, this just marks the round as "done" for that group.
  scoresSubmitted: boolean;
}

// Lightweight summary of a group, used to show a "pick your group" list
// before actually joining one. Includes the group's current roster (not
// just a count) so someone who was already added by name - by a teammate
// entering scores for them before they had the app open - can spot
// themselves and claim that existing entry instead of joining as a
// second, disconnected player. See claimPlayer.
export interface GroupPreview {
  id: string;
  name: string;
  playerCount: number;
  players: Player[];
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

// Whether a round is still being organized (players joining, tee groups
// being split, bet teams being assigned) or is live. Score entry only ever
// shows once a round is 'active' - this is what stops a round with several
// tee groups still forming from dumping everyone straight into one shared
// scorecard. Missing/undefined on the server (rounds created before this
// existed) is treated as 'active' so already-in-progress rounds aren't
// retroactively gated.
export type RoundStatus = 'prep' | 'active';

interface RoundState {
  // Local identity for the round/group this device is in, once joined.
  roundCode: string | null;
  playerId: string | null;
  myGroupId: string | null;
  // Uid of the round's host (the player who created it). Set once at
  // creation and never changes; a host can edit scores for any tee group,
  // not just their own, for testing and correcting mistakes.
  hostId: string | null;
  status: ConnectionStatus;
  roundStatus: RoundStatus;
  errorMessage: string | null;

  // Synced with Firebase Realtime Database once in a round.
  holes: HolesInfo;
  groups: Group[];
  // Which saved course (if any) this round's holes came from - shown on
  // the player's history entry once the round closes. Null for a round
  // that was scanned/entered fresh and never saved as a course.
  courseName: string | null;
  // When the round was created - read once (like hostId), not a live
  // listener, since it never changes. Used as the date on this player's
  // history entry rather than "whenever it happened to sync as closed."
  createdAt: number | null;

  // Each player's handicap (whole strokes), round-wide. Used to compute net
  // scores for any bet with its net-scoring setting on.
  handicaps: PlayerHandicaps;

  // Bet teams, round-wide - can include players from any tee group in the
  // round. nassau is recomputed locally whenever groups (scores change),
  // teams/playerTeams, handicaps, or nassauNet change.
  teams: Team[];
  playerTeams: PlayerTeams;
  nassauNet: boolean;
  nassauAmounts: NassauAmounts;
  // Whether Nassau's amounts are shown/settled in money or in drinks -
  // its own setting, independent of Match Play's and of every Skins/
  // Stroke Play bet's own unit (each of those carries its own on the
  // bet itself). See StakesUnit above.
  nassauStakesUnit: StakesUnit;
  nassau: NassauState;
  // Presses are Nassau-only (not Match Play). nassauPressCalls is the raw
  // persisted list of manual calls; nassauPressResults is the fully
  // computed set (manual + auto) recomputed alongside nassau itself.
  nassauAutoPress: boolean;
  nassauPressStacking: PressStackingMode;
  nassauPressCalls: NassauPressCall[];
  nassauPressResults: NassauPressResult[];

  // Match Play is a second, fully independent Nassau-style bet - its own
  // teams (a player can be grouped differently here than for Nassau), own
  // net-scoring flag, and own front/back/overall dollar amounts. Reuses
  // the same matchup engine and settlement math as Nassau since the game
  // itself is identical, just a separate bet with separate money and
  // (usually) separate sides.
  matchPlayTeams: Team[];
  matchPlayPlayerTeams: PlayerTeams;
  matchPlayNet: boolean;
  matchPlayAmounts: NassauAmounts;
  // Same idea as nassauStakesUnit, independent for Match Play.
  matchPlayStakesUnit: StakesUnit;
  matchPlay: NassauState;

  // Skins bets, round-wide - any number of independent pools, each with its
  // own participants, carryover rule, net-scoring setting, and dollar
  // value. skins is recomputed locally whenever groups (scores change),
  // skinsBets, or handicaps change.
  skinsBets: SkinsBet[];
  skins: SkinsState;

  // Stroke Play bets, round-wide - any number of independent pools (same
  // shape as Skins), settled on total score relative to par rather than
  // holes won. Only pays out once every entrant has finished the round.
  strokePlayBets: StrokePlayBet[];
  strokePlay: StrokePlayState;

  // Birdies and Doubles bets, round-wide - same pattern as Skins/Stroke
  // Play: any number of independent pools, each recomputed locally
  // whenever groups (scores change), the bet list, or handicaps change.
  birdiesBets: BirdiesBet[];
  birdies: BirdiesState;
  doublesBets: DoublesBet[];
  doubles: DoublesState;

  // Final $ owed per player, combining Nassau, Match Play, every Skins,
  // Stroke Play, Birdies, and Doubles bet. Recomputed whenever any of
  // those, or the dollar amounts, change.
  settlement: Settlement;
  betCards: BetCard[];

  // Local-only: which hole this device is looking at. Not synced, so each
  // player can review other holes without dragging everyone else along.
  currentHole: number;
  totalHoles: number;

  // Local-only: which tee group's scores this device is currently entering.
  // null means "my own group" (the common case). Only the host can point
  // this at a different group, to test scoring or correct another group's
  // mistake from their own device.
  scoringGroupId: string | null;

  // Transient state for the "join a round" flow, before a group has been
  // picked: the round code being previewed and the groups already in it.
  previewRoundCode: string | null;
  previewGroups: GroupPreview[];

  // Player-scoped, not round-scoped: this device's own saved name, the
  // shared course library, and this player's own settlement history.
  // Loaded on demand (not part of the round subscription) by whichever
  // screen needs them.
  profile: PlayerProfile | null;
  courses: CourseInfo[];
  history: HistoryEntry[];
  // This device's own saved payment handles (same load-on-demand pattern
  // as profile above). Other round players' handles are looked up
  // separately, on demand, into paymentHandlesByUid - there's no single
  // round-scoped node for these since a handle belongs to the player, not
  // the round.
  paymentHandles: PaymentHandles | null;
  paymentHandlesByUid: Record<string, PaymentHandles>;
  // Live-synced with the round (see _subscribeToRound) since both sides of
  // a payout need to see the other's sent/confirmed toggle update in real
  // time. Keyed the same way as PayoutStatusEntry: `${fromId}_${toId}`.
  payoutStatus: Record<string, PayoutStatusEntry>;

  // The round currently open in History's "View Round" screen, if any -
  // entirely separate from the live round state above so viewing a past
  // round never disturbs (or gets disturbed by) a round this device is
  // actively playing. Null whenever History's detail screen isn't open.
  historicalRound: HistoricalRoundView | null;
  historicalRoundLoading: boolean;
  historicalRoundError: string | null;

  // This player's own remembered regulars - see RegularPlayer. Loaded on
  // demand, same pattern as history.
  regulars: RegularPlayer[];

  // Actions
  createRound: (hostName: string) => Promise<void>;
  previewRound: (code: string) => Promise<void>;
  joinGroup: (code: string, groupId: string, name: string) => Promise<string>;
  createGroupAndJoin: (code: string, name: string, groupName?: string) => Promise<string>;
  // Takes over an existing name-only player entry (added manually by a
  // teammate before this player had the app open) as this device's own -
  // see claimPlayer. Everything already recorded for that entry (scores,
  // handicap, bet participation) carries over to this device's own uid.
  claimPlayer: (roundCode: string, groupId: string, ghostPlayerId: string) => Promise<void>;
  rejoinRound: (code: string, groupId: string) => Promise<void>;
  addPlayer: (groupId: string, name: string) => Promise<string>;
  // Quick-add version of addPlayer, for a saved regular - also seeds their
  // last-known handicap in one atomic write instead of leaving it at 0
  // until someone re-enters it.
  addRegularPlayer: (groupId: string, regular: RegularPlayer) => Promise<string>;
  removePlayer: (groupId: string, playerId: string) => Promise<void>;
  createGroup: (name?: string) => Promise<string>;
  movePlayerToGroup: (playerId: string, fromGroupId: string, toGroupId: string) => Promise<void>;
  setCurrentHole: (hole: number) => void;
  setTotalHoles: (totalHoles: 9 | 18) => Promise<void>;
  setScoringGroupId: (groupId: string | null) => void;
  enterScore: (holeNumber: number, playerId: string, strokes: number) => Promise<void>;
  // This player's own fairway/green/putts line for the round currently in
  // progress, hole-indexed - separate from the historical holeStats on a
  // closed-out HistoryEntry, though it's written to the same Firebase
  // path and ends up there once the round closes.
  myHoleStats: Record<number, HoleStat>;
  // Logs this player's own fairway/putts for one hole (fairway is null on
  // a par 3, where the stat doesn't apply). Private to this player - see
  // setHoleStat's own comment for how it's stored and how gir is derived.
  setHoleStat: (holeNumber: number, fairway: FairwayResult | null, putts: number | null) => Promise<void>;
  setHoles: (holes: HolesInfo) => Promise<void>;
  submitGroupScores: (groupId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  startRound: () => Promise<void>;
  createTeam: (name: string) => Promise<string>;
  renameTeam: (teamId: string, name: string) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  setPlayerTeam: (playerId: string, teamId: string | null) => Promise<void>;
  setNassauNet: (net: boolean) => Promise<void>;
  setNassauStakesUnit: (unit: StakesUnit) => Promise<void>;
  setNassauAmount: (segment: keyof NassauAmounts, amount: number) => Promise<void>;
  setNassauAutoPress: (enabled: boolean) => Promise<void>;
  setNassauPressStacking: (mode: PressStackingMode) => Promise<void>;
  callNassauPress: (matchupKey: string, segment: NassauSegmentKey) => Promise<void>;
  createMatchPlayTeam: (name: string) => Promise<string>;
  renameMatchPlayTeam: (teamId: string, name: string) => Promise<void>;
  deleteMatchPlayTeam: (teamId: string) => Promise<void>;
  setMatchPlayPlayerTeam: (playerId: string, teamId: string | null) => Promise<void>;
  setMatchPlayNet: (net: boolean) => Promise<void>;
  setMatchPlayStakesUnit: (unit: StakesUnit) => Promise<void>;
  setMatchPlayAmount: (segment: keyof NassauAmounts, amount: number) => Promise<void>;
  createSkinsBet: (name?: string) => Promise<string>;
  renameSkinsBet: (betId: string, name: string) => Promise<void>;
  deleteSkinsBet: (betId: string) => Promise<void>;
  setSkinsBetCarryover: (betId: string, carryover: boolean) => Promise<void>;
  setSkinsBetNet: (betId: string, net: boolean) => Promise<void>;
  setSkinsBetValuePerSkin: (betId: string, valuePerSkin: number) => Promise<void>;
  setSkinsBetPayoutMode: (betId: string, payoutMode: SkinsPayoutMode) => Promise<void>;
  setSkinsBetBuyIn: (betId: string, buyIn: number) => Promise<void>;
  setSkinsBetUnit: (betId: string, unit: StakesUnit) => Promise<void>;
  setPlayerInSkinsBet: (betId: string, playerId: string, inBet: boolean) => Promise<void>;
  createStrokePlayBet: (name?: string) => Promise<string>;
  renameStrokePlayBet: (betId: string, name: string) => Promise<void>;
  deleteStrokePlayBet: (betId: string) => Promise<void>;
  setStrokePlayBetNet: (betId: string, net: boolean) => Promise<void>;
  setStrokePlayBetPayoutMode: (betId: string, payoutMode: StrokePlayPayoutMode) => Promise<void>;
  setStrokePlayBetValuePerStroke: (betId: string, valuePerStroke: number) => Promise<void>;
  setStrokePlayBetBuyIn: (betId: string, buyIn: number) => Promise<void>;
  setStrokePlayBetUnit: (betId: string, unit: StakesUnit) => Promise<void>;
  setPlayerInStrokePlayBet: (betId: string, playerId: string, inBet: boolean) => Promise<void>;
  createBirdiesBet: (name?: string) => Promise<string>;
  renameBirdiesBet: (betId: string, name: string) => Promise<void>;
  deleteBirdiesBet: (betId: string) => Promise<void>;
  setBirdiesBetNet: (betId: string, net: boolean) => Promise<void>;
  setBirdiesBetAmount: (betId: string, amountPerBirdie: number) => Promise<void>;
  setBirdiesBetUnit: (betId: string, unit: StakesUnit) => Promise<void>;
  setPlayerInBirdiesBet: (betId: string, playerId: string, inBet: boolean) => Promise<void>;
  createDoublesBet: (name?: string) => Promise<string>;
  renameDoublesBet: (betId: string, name: string) => Promise<void>;
  deleteDoublesBet: (betId: string) => Promise<void>;
  setDoublesBetNet: (betId: string, net: boolean) => Promise<void>;
  setDoublesBetAmount: (betId: string, amountPerDouble: number) => Promise<void>;
  setDoublesBetUnit: (betId: string, unit: StakesUnit) => Promise<void>;
  setPlayerInDoublesBet: (betId: string, playerId: string, inBet: boolean) => Promise<void>;
  setPlayerHandicap: (playerId: string, handicap: number) => Promise<void>;
  setCourseName: (name: string | null) => Promise<void>;
  loadProfile: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  setHandicap18: (handicap18: number | null) => Promise<void>;
  setHandicapType: (handicapType: HandicapType | null) => Promise<void>;
  loadPaymentHandles: () => Promise<void>;
  savePaymentHandles: (update: Partial<Omit<PaymentHandles, 'updatedAt'>>) => Promise<void>;
  loadPaymentHandlesForPlayers: (uids: string[]) => Promise<void>;
  // roundCode defaults to the live round (get().roundCode) when omitted -
  // pass it explicitly to mark a payout on a past round from History
  // without disturbing whatever round this device is actively playing.
  markPayoutSent: (fromId: string, toId: string, sent: boolean, roundCode?: string) => Promise<void>;
  markPayoutConfirmed: (fromId: string, toId: string, confirmed: boolean, roundCode?: string) => Promise<void>;
  // One-time fetch + compute of a past round's full scorecard and
  // settlement, by roundCode, into historicalRound - see
  // HistoricalRoundView. Independent of the live round subscription.
  loadHistoricalRound: (roundCode: string) => Promise<void>;
  // Keeps historicalRound.payoutStatus live so a sent/confirmed toggle
  // from either side of a past-round payout shows up without a refetch.
  // Returns an unsubscribe function - call it when the detail screen
  // unmounts.
  subscribeToHistoricalPayoutStatus: (roundCode: string) => () => void;
  clearHistoricalRound: () => void;
  submitFeedback: (text: string) => Promise<void>;
  fetchFeedback: () => Promise<FeedbackEntry[]>;
  loadCourses: () => Promise<void>;
  saveCourse: (
    name: string,
    holes: HolesInfo,
    totalHoles: number,
    tees?: TeeInfo[],
    notes?: string
  ) => Promise<string>;
  applyCourse: (courseId: string) => Promise<void>;
  loadHistory: () => Promise<void>;
  loadRegulars: () => Promise<void>;
  leaveRound: () => void;

  // Internal: wires up the realtime listeners for a round. Exposed on the
  // interface because zustand actions call it via get(), but screens should
  // not call this directly.
  _subscribeToRound: (code: string, groupId: string, uid: string) => void;
}

// ---------- Resume-round persistence ----------

// Remembers the last round/group this device successfully joined, so the
// app can offer to resume it after being closed mid-round instead of
// stranding the player back at the welcome screen with no way to find
// their way back in (the round code isn't shown anywhere once you're
// past the join screen).
const ACTIVE_ROUND_KEY = 'thenPressMe:activeRound';

export interface SavedActiveRound {
  roundCode: string;
  groupId: string;
}

async function persistActiveRound(roundCode: string, groupId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(ACTIVE_ROUND_KEY, JSON.stringify({ roundCode, groupId }));
  } catch {
    // Best-effort - resume just won't be offered next launch.
  }
}

async function clearActiveRound(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ACTIVE_ROUND_KEY);
  } catch {
    // Ignore - nothing destructive depends on this succeeding.
  }
}

// Called once at app boot (outside the store) to see if there's a round to
// offer resuming. Not a zustand action since it's needed before any store
// subscription exists.
export async function getSavedActiveRound(): Promise<SavedActiveRound | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_ROUND_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.roundCode === 'string' && typeof parsed?.groupId === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------- Nassau helpers (operate round-wide, across every tee group) ----------

const emptySegment = (): NassauSegmentState => ({
  status: 0,
  holesPlayed: 0,
  closed: false,
  closedAtHole: null,
});

interface NassauEntity {
  id: string;
  label: string;
  playerIds: string[];
}

/**
 * Groups the round's players into the "sides" that bet against each other:
 * one side per team that has at least one player on it. A player who isn't
 * on any Nassau team sits out of Nassau entirely - they're still tracked
 * for individual stroke play, just not matched up against anyone here.
 * Players can come from any tee group.
 */
function buildNassauEntities(
  players: Player[],
  teams: Team[],
  playerTeams: PlayerTeams
): NassauEntity[] {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const teamPlayerIds = new Map<string, string[]>();

  for (const player of players) {
    const teamId = playerTeams[player.id];
    if (teamId && teamById.has(teamId)) {
      const list = teamPlayerIds.get(teamId) ?? [];
      list.push(player.id);
      teamPlayerIds.set(teamId, list);
    }
  }

  const entities: NassauEntity[] = [];
  for (const team of teams) {
    const playerIds = teamPlayerIds.get(team.id);
    if (playerIds && playerIds.length > 0) {
      entities.push({ id: team.id, label: team.name, playerIds });
    }
  }
  return entities;
}

/**
 * Best-ball score for a side on one hole: the lowest strokes among its
 * players who have a score entered, or null if none of them do yet.
 */
function sideHoleScore(
  playerIds: string[],
  holeScores: Record<string, number> | undefined
): number | null {
  if (!holeScores) return null;
  let best: number | null = null;
  for (const id of playerIds) {
    const strokes = holeScores[id];
    if (strokes == null) continue;
    if (best == null || strokes < best) best = strokes;
  }
  return best;
}

function computeNassauForSides(
  a: NassauEntity,
  b: NassauEntity,
  scores: HoleScores,
  totalHoles: number
): NassauMatchup {
  const front = emptySegment();
  const back = emptySegment();
  const overall = emptySegment();
  const holes: NassauHoleResult[] = [];

  for (let hole = 1; hole <= totalHoles; hole++) {
    const holeScores = scores[hole];
    const aScore = sideHoleScore(a.playerIds, holeScores);
    const bScore = sideHoleScore(b.playerIds, holeScores);

    if (aScore == null || bScore == null) {
      holes.push({ hole, scoreA: aScore, scoreB: bScore, winner: null });
      continue;
    }

    // Lower score wins the hole (gross, no handicap yet)
    let holeResult = 0; // 0 = tie
    if (aScore < bScore) holeResult = 1;
    else if (bScore < aScore) holeResult = -1;

    const segment = hole <= 9 ? front : back;
    segment.status += holeResult;
    segment.holesPlayed += 1;
    overall.status += holeResult;
    overall.holesPlayed += 1;

    // Mark closed the moment the margin exceeds what's left to play in
    // that segment - checked fresh on every hole rather than just once,
    // since "closed" never reverts once it's true.
    const segmentRemaining = NASSAU_HALF_HOLES - segment.holesPlayed;
    if (segmentRemaining > 0 && Math.abs(segment.status) > segmentRemaining && !segment.closed) {
      segment.closed = true;
      segment.closedAtHole = hole;
    }
    const overallRemaining = totalHoles - overall.holesPlayed;
    if (overallRemaining > 0 && Math.abs(overall.status) > overallRemaining && !overall.closed) {
      overall.closed = true;
      overall.closedAtHole = hole;
    }

    holes.push({
      hole,
      scoreA: aScore,
      scoreB: bScore,
      winner: holeResult > 0 ? 'a' : holeResult < 0 ? 'b' : 'tie',
    });
  }

  return {
    idA: a.id,
    idB: b.id,
    labelA: a.label,
    labelB: b.label,
    playerIdsA: a.playerIds,
    playerIdsB: b.playerIds,
    front,
    back,
    overall,
    holes,
  };
}

// True only when every player on both sides of a would-be matchup belongs
// to the same single tee group - used to keep Nassau matchups from ever
// spanning tee groups (see computeNassau).
function sidesShareOneTeeGroup(
  a: NassauEntity,
  b: NassauEntity,
  playerGroupId: Map<string, string>
): boolean {
  const allIds = [...a.playerIds, ...b.playerIds];
  const firstGroup = playerGroupId.get(allIds[0]);
  if (firstGroup == null) return false;
  return allIds.every((id) => playerGroupId.get(id) === firstGroup);
}

/**
 * Recomputes the round's Nassau state from scratch: one matchup per unique
 * pair of sides (round-robin), where a "side" is a bet team (if players
 * have been grouped) or a lone player (if not).
 *
 * playerGroupId, when passed, restricts matchups to sides that are
 * entirely within one tee group - Nassau's rule, since a matchup whose two
 * sides are in different tee groups could be on different holes at
 * different times, which breaks both the live margin tracking and press
 * timing (a press is called "from the current hole", which only means
 * something when both sides share one). Match Play doesn't pass this and
 * keeps the older round-wide behavior.
 */
function computeNassau(
  players: Player[],
  scores: HoleScores,
  teams: Team[],
  playerTeams: PlayerTeams,
  totalHoles: number,
  playerGroupId?: Map<string, string>
): NassauState {
  const entities = buildNassauEntities(players, teams, playerTeams);
  const matchups: NassauMatchup[] = [];
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      const a = entities[i];
      const b = entities[j];
      if (playerGroupId && !sidesShareOneTeeGroup(a, b, playerGroupId)) continue;
      matchups.push(computeNassauForSides(a, b, scores, totalHoles));
    }
  }
  return matchups;
}

// ---------- Nassau presses (Nassau only, not Match Play) ----------

const SEGMENT_LABELS: Record<NassauSegmentKey, string> = {
  front: 'Front 9',
  back: 'Back 9',
  overall: 'Overall',
};

// A base segment's own hole range - front is always holes 1-9, back is
// 10-totalHoles (null for a 9-hole round, which has no back nine), overall
// is 1-totalHoles. Exported so the UI can gate the "Press" button on
// whether the current hole actually falls within a segment, without
// duplicating this logic.
export function nassauSegmentRange(
  segment: NassauSegmentKey,
  totalHoles: number
): { start: number; end: number } | null {
  if (segment === 'front') return { start: 1, end: Math.min(NASSAU_HALF_HOLES, totalHoles) };
  if (segment === 'back') {
    return totalHoles > NASSAU_HALF_HOLES ? { start: NASSAU_HALF_HOLES + 1, end: totalHoles } : null;
  }
  return { start: 1, end: totalHoles };
}

/**
 * The same head-to-head, hole-by-hole margin tracking as a base Nassau
 * segment, just over an arbitrary hole range instead of a fixed
 * front/back/overall one - what a press needs, since a press is exactly a
 * fresh mini-segment starting partway through the one it presses.
 */
function computeSegmentRange(
  playerIdsA: string[],
  playerIdsB: string[],
  scores: HoleScores,
  startHole: number,
  endHole: number
): NassauSegmentState {
  const segment = emptySegment();
  const required = endHole - startHole + 1;
  for (let hole = startHole; hole <= endHole; hole += 1) {
    const holeScores = scores[hole];
    const aScore = sideHoleScore(playerIdsA, holeScores);
    const bScore = sideHoleScore(playerIdsB, holeScores);
    if (aScore == null || bScore == null) continue;

    let holeResult = 0;
    if (aScore < bScore) holeResult = 1;
    else if (bScore < aScore) holeResult = -1;

    segment.status += holeResult;
    segment.holesPlayed += 1;

    const remaining = required - segment.holesPlayed;
    if (remaining > 0 && Math.abs(segment.status) > remaining && !segment.closed) {
      segment.closed = true;
      segment.closedAtHole = hole;
    }
  }
  return segment;
}

/**
 * Works out every active press for every Nassau matchup - both auto-
 * presses (a pure function of the scores and the round's auto-press and
 * stacking settings, so every viewer computes the same ones with nothing
 * to persist) and manually-called presses (persisted events, passed in as
 * `calls`). Walks each matchup's segment hole by hole, tracking whichever
 * window is currently "live" for triggering the next auto-press - the
 * base segment until the first press starts, then that press, and so on -
 * so an auto-press at 2 down chains off the most recent press rather than
 * the original margin. A manually-called press always takes effect at the
 * hole it was called on and becomes the new live window from there.
 * Single-stacking caps a segment at its first press, of either kind, in
 * hole order; unlimited stacking keeps chaining for as long as the 2-down
 * condition (or another manual call) keeps firing. A press never pauses
 * or replaces the bet it presses - both are settled independently.
 */
function computeNassauPressResults(
  matchups: NassauState,
  scores: HoleScores,
  totalHoles: number,
  autoPress: boolean,
  stacking: PressStackingMode,
  calls: NassauPressCall[]
): NassauPressResult[] {
  // 'none' turns presses off entirely - neither auto nor manual ones
  // are computed, regardless of the auto-press flag or any calls made
  // before stacking was switched to 'none'.
  if (stacking === 'none') return [];
  const results: NassauPressResult[] = [];
  const callsByKey = new Map<string, NassauPressCall[]>();
  for (const call of calls) {
    const key = `${call.matchupKey}|${call.segment}`;
    const list = callsByKey.get(key) ?? [];
    list.push(call);
    callsByKey.set(key, list);
  }

  for (const matchup of matchups) {
    const matchupKey = `${matchup.idA}|${matchup.idB}`;
    for (const segment of ['front', 'back', 'overall'] as NassauSegmentKey[]) {
      const range = nassauSegmentRange(segment, totalHoles);
      if (!range) continue;
      const key = `${matchupKey}|${segment}`;
      const manualByHole = new Map((callsByKey.get(key) ?? []).map((call) => [call.startHole, call]));

      let status = 0;
      let pressed = false;

      for (let hole = range.start; hole <= range.end; hole += 1) {
        const manualCall = manualByHole.get(hole);
        if (manualCall && !(pressed && stacking === 'single')) {
          results.push({
            id: manualCall.id,
            matchupKey,
            segment,
            segmentName: SEGMENT_LABELS[segment],
            startHole: hole,
            endHole: range.end,
            source: 'manual',
            state: computeSegmentRange(matchup.playerIdsA, matchup.playerIdsB, scores, hole, range.end),
          });
          status = 0;
          pressed = true;
        }

        // Once a segment is capped at a single press, keep scanning holes
        // (in case a later manual call needs to be seen and ignored) but
        // stop tracking margin - there's nothing left it could trigger.
        if (pressed && stacking === 'single') continue;

        const holeScores = scores[hole];
        const aScore = sideHoleScore(matchup.playerIdsA, holeScores);
        const bScore = sideHoleScore(matchup.playerIdsB, holeScores);
        if (aScore == null || bScore == null) continue;
        let holeResult = 0;
        if (aScore < bScore) holeResult = 1;
        else if (bScore < aScore) holeResult = -1;
        status += holeResult;

        if (autoPress && Math.abs(status) === 2) {
          const nextHole = hole + 1;
          if (nextHole <= range.end) {
            results.push({
              id: `auto-${matchupKey}-${segment}-${nextHole}`,
              matchupKey,
              segment,
              segmentName: SEGMENT_LABELS[segment],
              startHole: nextHole,
              endHole: range.end,
              source: 'auto',
              state: computeSegmentRange(matchup.playerIdsA, matchup.playerIdsB, scores, nextHole, range.end),
            });
            status = 0;
            pressed = true;
          }
        }
      }
    }
  }
  return results;
}

/**
 * Settles every resolved press the same way settleMatchups settles a base
 * segment - same resolved rule (closed or fully played), same win/loss
 * split - just against the press's own hole range and the dollar amount
 * of whichever segment it presses (a press always uses that amount, never
 * its own). A press never touches the base bet's own payout - both pay
 * out independently, same as real side money layered onto a Nassau.
 */
function settlePresses(
  presses: NassauPressResult[],
  matchups: NassauState,
  amounts: NassauAmounts,
  bump: (playerId: string, amount: number, label: string) => void,
  recordCard: (
    key: string,
    category: BetCard['category'],
    title: string,
    isPot: boolean,
    playerId: string,
    amount: number
  ) => void
): void {
  const matchupByKey = new Map(matchups.map((m) => [`${m.idA}|${m.idB}`, m]));
  for (const press of presses) {
    const matchup = matchupByKey.get(press.matchupKey);
    if (!matchup) continue;
    const amount = amounts[press.segment];
    const required = press.endHole - press.startHole + 1;
    if (amount <= 0 || press.state.status === 0 || !isNassauSegmentResolved(press.state, required)) continue;
    const winnerSideIsA = press.state.status > 0;
    const winners = winnerSideIsA ? matchup.playerIdsA : matchup.playerIdsB;
    const losers = winnerSideIsA ? matchup.playerIdsB : matchup.playerIdsA;
    if (winners.length === 0 || losers.length === 0) continue;
    const winnersOpponentLabel = winnerSideIsA ? matchup.labelB : matchup.labelA;
    const losersOpponentLabel = winnerSideIsA ? matchup.labelA : matchup.labelB;
    const perWinnerShare = (amount * losers.length) / winners.length;
    const pressNoun = press.source === 'auto' ? 'Auto-Press' : 'Press';
    const cardKey = `Nassau-press-${press.id}`;
    const cardTitle = `${matchup.labelA} vs ${matchup.labelB} \u00b7 ${press.segmentName} ${pressNoun} (from ${press.startHole})`;
    for (const loserId of losers) {
      bump(loserId, -amount, `Nassau ${press.segmentName} ${pressNoun} vs ${losersOpponentLabel}`);
      recordCard(cardKey, 'Nassau', cardTitle, false, loserId, -amount);
    }
    for (const winnerId of winners) {
      bump(winnerId, perWinnerShare, `Nassau ${press.segmentName} ${pressNoun} vs ${winnersOpponentLabel}`);
      recordCard(cardKey, 'Nassau', cardTitle, false, winnerId, perWinnerShare);
    }
  }
}

/**
 * Merges every tee group's scores into one lookup keyed by hole then
 * player id, so a bet team spanning multiple tee groups can be scored
 * without caring which group actually recorded a given player's strokes.
 * Player ids don't collide across groups in practice (uid for a
 * self-joined player, a fresh push() key for a manually-added one).
 */
function mergeGroupScores(groups: Group[]): HoleScores {
  const merged: HoleScores = {};
  for (const group of groups) {
    for (const [holeKey, holeScores] of Object.entries(group.scores)) {
      const hole = Number(holeKey);
      merged[hole] = { ...(merged[hole] ?? {}), ...holeScores };
    }
  }
  return merged;
}

/**
 * True when holes 10-18 are missing, or when the round's hole data repeats
 * the same handicap index across both nines instead of every hole having
 * its own unique 1-18 rank - the signal that this is a 9-hole course (or
 * one nine of a 27-hole course) rather than a genuine, already-distinct
 * 18-hole layout. Used to decide whether switching a round to 18 holes
 * should mirror the front 9 into the back 9 automatically.
 */
function backNineNeedsMirroring(holes: HolesInfo): boolean {
  const indices: number[] = [];
  for (let hole = 1; hole <= 18; hole += 1) {
    const info = holes[hole];
    if (!info) return true;
    indices.push(info.handicapIndex);
  }
  return new Set(indices).size !== indices.length;
}

/**
 * Every handicap entered anywhere in the app - profile or per-round - is
 * always the player's 18-hole number, so a 9-hole round first halves it
 * (standard course-handicap practice) before doing anything else with it.
 */
function forRoundLength(handicap18: number, totalHoles: number): number {
  return totalHoles === 9 ? handicap18 / 2 : handicap18;
}

/**
 * Rescales everyone's handicap (already brought down to this round's
 * length) to be relative to the lowest handicap actually playing - the
 * low-handicap player plays scratch (0 strokes) and everyone else only
 * gets the strokes they need to close the gap to that player, instead of
 * each player's full handicap being applied against the course outright.
 * This is standard match-play "playing handicap" practice: a 4 and a 7 in
 * the same 18-hole round means the 4 plays scratch and the 7 gets 3
 * strokes, on the 3 hardest holes only - not 4 and 7 strokes spread across
 * all 18. A player with no handicap entered defaults to 0, same as
 * everywhere else handicaps are read.
 */
export function relativeHandicaps(
  handicaps: PlayerHandicaps,
  players: Player[],
  totalHoles: number
): PlayerHandicaps {
  if (players.length === 0) return {};
  const raw = players.map((player) => forRoundLength(handicaps[player.id] ?? 0, totalHoles));
  const lowest = Math.min(...raw);
  const relative: PlayerHandicaps = {};
  players.forEach((player, index) => {
    relative[player.id] = raw[index] - lowest;
  });
  return relative;
}

/**
 * Full per-hole handicap allocation: a player with handicap H gets
 * floor(H / 18) strokes on every hole, plus one more on whichever holes
 * have a stroke index (HoleInfo.handicapIndex) at or below H % 18 - the
 * standard way of spreading a handicap across all 18 holes instead of just
 * the hardest few. H is expected to already be relative to the round's
 * lowest handicap (see relativeHandicaps) rather than a raw handicap.
 * Negative handicaps are clamped to 0 strokes rather than adding strokes
 * to par.
 */
export function strokesReceivedOnHole(handicap: number, strokeIndex: number): number {
  const h = Math.max(0, Math.round(handicap));
  const base = Math.floor(h / 18);
  const extra = h % 18;
  return base + (strokeIndex <= extra ? 1 : 0);
}

/**
 * Converts gross scores to net scores (gross minus each player's allocated
 * strokes for that hole), for bets that settle on net rather than gross.
 * Handicaps are first rescaled relative to the lowest handicap among the
 * players passed in (round-wide, not just the players actually scored on
 * a given hole), so the low-handicap player never receives strokes. Falls
 * back to using the hole number itself as the stroke index when no
 * scorecard has been scanned, so net scoring still works (just without the
 * real course's actual hole difficulty order).
 */
export function toNetScores(
  scores: HoleScores,
  holes: HolesInfo,
  handicaps: PlayerHandicaps,
  players: Player[],
  totalHoles: number
): HoleScores {
  const adjusted = relativeHandicaps(handicaps, players, totalHoles);
  const net: HoleScores = {};
  for (const [holeKey, holeScores] of Object.entries(scores)) {
    const hole = Number(holeKey);
    const strokeIndex = holes[hole]?.handicapIndex ?? hole;
    const netHoleScores: Record<string, number> = {};
    for (const [playerId, strokes] of Object.entries(holeScores)) {
      netHoleScores[playerId] = strokes - strokesReceivedOnHole(adjusted[playerId] ?? 0, strokeIndex);
    }
    net[hole] = netHoleScores;
  }
  return net;
}

/**
 * Computes one Skins bet's totals, round-wide, from merged scores across
 * every tee group. A hole only resolves once every opted-in player has a
 * score recorded for it; a tie either carries the skin into the next
 * resolved hole or loses it outright, per that bet's carryover setting.
 */
function computeSkinsForBet(
  players: Player[],
  scores: HoleScores,
  bet: SkinsBet,
  totalHoles: number
): SkinsBetResult {
  const eligible = players.filter((player) => bet.playerIds.includes(player.id));

  if (eligible.length < 2) {
    return {
      betId: bet.id,
      name: bet.name,
      carryover: bet.carryover,
      totals: [],
      pendingSkins: 0,
      holesResolved: 0,
      holes: [],
    };
  }

  const won = new Map<string, number>(eligible.map((player) => [player.id, 0]));
  let pending = 0;
  let holesResolved = 0;
  const holeResults: SkinsHoleResult[] = [];

  for (let hole = 1; hole <= totalHoles; hole += 1) {
    const holeScores = scores[hole];
    const scoreMap: Record<string, number | null> = {};
    eligible.forEach((player) => {
      scoreMap[player.id] = holeScores?.[player.id] ?? null;
    });

    const strokes = eligible.map((player) => holeScores?.[player.id]);
    if (!holeScores || strokes.some((s) => s == null)) {
      holeResults.push({
        hole,
        scores: scoreMap,
        winnerId: null,
        skinsAwarded: 0,
        tied: false,
        resolved: false,
      });
      continue;
    }
    const numericStrokes = strokes as number[];

    holesResolved += 1;
    pending += 1;

    const lowest = Math.min(...numericStrokes);
    const winners = eligible.filter((_, i) => numericStrokes[i] === lowest);

    if (winners.length === 1) {
      const awarded = pending;
      won.set(winners[0].id, (won.get(winners[0].id) ?? 0) + awarded);
      pending = 0;
      holeResults.push({
        hole,
        scores: scoreMap,
        winnerId: winners[0].id,
        skinsAwarded: awarded,
        tied: false,
        resolved: true,
      });
    } else {
      // Tied with carryover off - the skin is simply lost for this hole.
      if (!bet.carryover) pending = 0;
      holeResults.push({
        hole,
        scores: scoreMap,
        winnerId: null,
        skinsAwarded: 0,
        tied: true,
        resolved: true,
      });
    }
    // Tied with carryover on: `pending` rides into the next resolved hole.
  }

  const totals: SkinsPlayerTotal[] = eligible
    .map((player) => ({ id: player.id, label: player.name, skinsWon: won.get(player.id) ?? 0 }))
    .sort((a, b) => b.skinsWon - a.skinsWon);

  return {
    betId: bet.id,
    name: bet.name,
    carryover: bet.carryover,
    totals,
    pendingSkins: pending,
    holesResolved,
    holes: holeResults,
  };
}

/**
 * Computes every Skins bet in the round, independently - bets can share
 * players (unlike Nassau teams, a player can only be on one team per bet),
 * so each is scored on its own without regard to the others. Each bet picks
 * gross or net scores per its own net-scoring setting.
 */
function computeSkins(
  players: Player[],
  grossScores: HoleScores,
  netScores: HoleScores,
  bets: SkinsBet[],
  totalHoles: number
): SkinsState {
  return bets.map((bet) =>
    computeSkinsForBet(players, bet.net ? netScores : grossScores, bet, totalHoles)
  );
}

// Falls back to par 4 for a hole with no par recorded yet, matching how
// the Scoring tab treats an unset par - so an incomplete scorecard never
// makes a Stroke Play total read as raw strokes instead of relative to par.
function strokePlayHolePar(holes: HolesInfo, holeNumber: number): number {
  const rawPar = holes[holeNumber]?.par;
  return rawPar != null && rawPar > 0 ? rawPar : 4;
}

/**
 * Computes one Stroke Play bet's standings: total score relative to par
 * for each eligible entrant, best to worst. `resolved` only turns true
 * once every entrant has played the whole round - standings show live as
 * scores come in, but nothing settles until then.
 */
function computeStrokePlayForBet(
  players: Player[],
  scores: HoleScores,
  holes: HolesInfo,
  bet: StrokePlayBet,
  totalHoles: number
): StrokePlayBetResult {
  const eligible = players.filter((player) => bet.playerIds.includes(player.id));

  if (eligible.length < 2) {
    return { betId: bet.id, name: bet.name, totals: [], resolved: false };
  }

  const totals: StrokePlayPlayerTotal[] = eligible.map((player) => {
    let strokes = 0;
    let par = 0;
    let holesPlayed = 0;
    for (const [holeKey, holeScores] of Object.entries(scores)) {
      const score = holeScores[player.id];
      if (score == null) continue;
      par += strokePlayHolePar(holes, Number(holeKey));
      strokes += score;
      holesPlayed += 1;
    }
    return { id: player.id, label: player.name, toPar: strokes - par, holesPlayed };
  });

  totals.sort((a, b) => a.toPar - b.toPar);
  const resolved = totals.every((total) => total.holesPlayed >= totalHoles);

  return { betId: bet.id, name: bet.name, totals, resolved };
}

/**
 * Computes every Stroke Play bet in the round, independently - same
 * pattern as Skins. Each bet picks gross or net scores per its own
 * net-scoring setting.
 */
function computeStrokePlay(
  players: Player[],
  grossScores: HoleScores,
  netScores: HoleScores,
  holes: HolesInfo,
  bets: StrokePlayBet[],
  totalHoles: number
): StrokePlayState {
  return bets.map((bet) =>
    computeStrokePlayForBet(players, bet.net ? netScores : grossScores, holes, bet, totalHoles)
  );
}

/**
 * Computes one Birdies bet's totals, round-wide. A hole only resolves once
 * every eligible player has a score recorded for it. Every eligible
 * player under par that hole earns points equal to how far under (1 for a
 * birdie, 2 for an eagle, and so on) - there's no winner-take-all on a
 * hole the way Skins has, multiple players can all score on the same hole.
 */
function computeBirdiesForBet(
  players: Player[],
  scores: HoleScores,
  holes: HolesInfo,
  bet: BirdiesBet,
  totalHoles: number
): BirdiesBetResult {
  const eligible = players.filter((player) => bet.playerIds.includes(player.id));

  if (eligible.length < 2) {
    return { betId: bet.id, name: bet.name, totals: [], holesResolved: 0, holes: [] };
  }

  const points = new Map<string, number>(eligible.map((player) => [player.id, 0]));
  let holesResolved = 0;
  const holeResults: BirdiesHoleResult[] = [];

  for (let hole = 1; hole <= totalHoles; hole += 1) {
    const holeScores = scores[hole];
    const scoreMap: Record<string, number | null> = {};
    eligible.forEach((player) => {
      scoreMap[player.id] = holeScores?.[player.id] ?? null;
    });

    const resolved = !!holeScores && eligible.every((player) => holeScores[player.id] != null);
    const scorers: Record<string, number> = {};
    if (resolved) {
      holesResolved += 1;
      const par = strokePlayHolePar(holes, hole);
      eligible.forEach((player) => {
        const strokes = holeScores![player.id];
        const under = par - strokes;
        if (under > 0) {
          scorers[player.id] = under;
          points.set(player.id, (points.get(player.id) ?? 0) + under);
        }
      });
    }

    holeResults.push({ hole, scores: scoreMap, scorers, resolved });
  }

  const totals: BirdiesPlayerTotal[] = eligible
    .map((player) => ({ id: player.id, label: player.name, points: points.get(player.id) ?? 0 }))
    .sort((a, b) => b.points - a.points);

  return { betId: bet.id, name: bet.name, totals, holesResolved, holes: holeResults };
}

/**
 * Computes every Birdies bet in the round, independently - same pattern as
 * Skins. Each bet picks gross or net scores per its own net-scoring
 * setting.
 */
function computeBirdies(
  players: Player[],
  grossScores: HoleScores,
  netScores: HoleScores,
  holes: HolesInfo,
  bets: BirdiesBet[],
  totalHoles: number
): BirdiesState {
  return bets.map((bet) =>
    computeBirdiesForBet(players, bet.net ? netScores : grossScores, holes, bet, totalHoles)
  );
}

/**
 * Computes one Doubles bet's totals, round-wide - the mirror image of
 * computeBirdiesForBet. Every eligible player at double bogey or worse on
 * a resolved hole picks up one double for it, independent of what anyone
 * else on the hole scored.
 */
function computeDoublesForBet(
  players: Player[],
  scores: HoleScores,
  holes: HolesInfo,
  bet: DoublesBet,
  totalHoles: number
): DoublesBetResult {
  const eligible = players.filter((player) => bet.playerIds.includes(player.id));

  if (eligible.length < 2) {
    return { betId: bet.id, name: bet.name, totals: [], holesResolved: 0, holes: [] };
  }

  const counts = new Map<string, number>(eligible.map((player) => [player.id, 0]));
  let holesResolved = 0;
  const holeResults: DoublesHoleResult[] = [];

  for (let hole = 1; hole <= totalHoles; hole += 1) {
    const holeScores = scores[hole];
    const scoreMap: Record<string, number | null> = {};
    eligible.forEach((player) => {
      scoreMap[player.id] = holeScores?.[player.id] ?? null;
    });

    const resolved = !!holeScores && eligible.every((player) => holeScores[player.id] != null);
    const doubledIds: string[] = [];
    if (resolved) {
      holesResolved += 1;
      const par = strokePlayHolePar(holes, hole);
      eligible.forEach((player) => {
        const strokes = holeScores![player.id];
        if (strokes - par >= 2) {
          doubledIds.push(player.id);
          counts.set(player.id, (counts.get(player.id) ?? 0) + 1);
        }
      });
    }

    holeResults.push({ hole, scores: scoreMap, doubledIds, resolved });
  }

  const totals: DoublesPlayerTotal[] = eligible
    .map((player) => ({ id: player.id, label: player.name, doubleCount: counts.get(player.id) ?? 0 }))
    .sort((a, b) => a.doubleCount - b.doubleCount);

  return { betId: bet.id, name: bet.name, totals, holesResolved, holes: holeResults };
}

/**
 * Computes every Doubles bet in the round, independently - same pattern as
 * Birdies/Skins.
 */
function computeDoubles(
  players: Player[],
  grossScores: HoleScores,
  netScores: HoleScores,
  holes: HolesInfo,
  bets: DoublesBet[],
  totalHoles: number
): DoublesState {
  return bets.map((bet) =>
    computeDoublesForBet(players, bet.net ? netScores : grossScores, holes, bet, totalHoles)
  );
}

// Front/back are always a 9-hole segment, regardless of round length -
// exported so the leaderboard UI can compute "holes to play" without
// duplicating the number.
export const NASSAU_HALF_HOLES = 9;

/**
 * A Nassau/Match Play segment (front, back, or overall) is done either
 * once every hole in it has actually been played, or once it's already
 * been closed out - the trailing side's margin can no longer be caught
 * in the holes remaining. Match play etiquette is to concede and stop
 * playing once a match is decided, so a closed-out segment's last few
 * holes often never get scores at all; requiring every hole to be
 * played before it counts as done would leave a decided match (and the
 * round as a whole) waiting forever on holes nobody is going to play.
 * A tied segment (`status === 0`) can never be `closed`, so it still
 * needs every hole played - a tie genuinely isn't final until then.
 */
export function isNassauSegmentResolved(segment: NassauSegmentState, required: number): boolean {
  return segment.closed || segment.holesPlayed >= required;
}

// A matchup is fully resolved only once every one of its segments is - and
// a segment counts as done once it's either been fully played or already
// closed out, matching how money actually settles in settleMatchups.
// Checking overall.holesPlayed alone isn't enough: a match that's closed
// out early (say, 3&2) often never gets its last couple of holes played at
// all, so overall.holesPlayed would sit short of totalHoles forever even
// though the match is long over. Exported so both the Settlement screen
// (for its "All Bets Closed" banner and Bets/Pots tabs) and the store's own
// history-recording logic share one definition of "done" instead of two
// that could drift apart.
export function isNassauMatchupResolved(matchup: NassauMatchup, totalHoles: number): boolean {
  // A 9-hole round has no back nine at all, so matchup.back can never
  // accumulate holesPlayed and would otherwise sit "unresolved" forever -
  // exactly the way settleMatchups already treats it (it just never pays),
  // so being "closed" can't depend on it either.
  const backResolved =
    totalHoles === 9 ? true : isNassauSegmentResolved(matchup.back, NASSAU_HALF_HOLES);
  return (
    isNassauSegmentResolved(matchup.front, NASSAU_HALF_HOLES) &&
    backResolved &&
    isNassauSegmentResolved(matchup.overall, totalHoles)
  );
}

// Nothing is final until every bet is - a Nassau/Match Play segment only
// counts once fully played (or closed out), a Skins bet once every hole is
// resolved, a Stroke Play bet once every entrant has finished. A bet with
// fewer than 2 eligible players never really got going, so it doesn't hold
// up the "closed" state.
export function allBetsClosed(
  nassau: NassauState,
  matchPlay: NassauState,
  skins: SkinsState,
  strokePlay: StrokePlayState,
  birdies: BirdiesState,
  doubles: DoublesState,
  totalHoles: number,
  nassauPressResults: NassauPressResult[]
): boolean {
  const nassauDone = nassau.every((matchup) => isNassauMatchupResolved(matchup, totalHoles));
  const matchPlayDone = matchPlay.every((matchup) => isNassauMatchupResolved(matchup, totalHoles));
  const skinsDone = skins.every((bet) => bet.totals.length === 0 || bet.holesResolved >= totalHoles);
  const strokePlayDone = strokePlay.every((bet) => bet.totals.length === 0 || bet.resolved);
  const birdiesDone = birdies.every((bet) => bet.totals.length === 0 || bet.holesResolved >= totalHoles);
  const doublesDone = doubles.every((bet) => bet.totals.length === 0 || bet.holesResolved >= totalHoles);
  const pressesDone = nassauPressResults.every((press) =>
    isNassauSegmentResolved(press.state, press.endHole - press.startHole + 1)
  );
  return (
    nassauDone && matchPlayDone && skinsDone && strokePlayDone && birdiesDone && doublesDone && pressesDone
  );
}

/**
 * Settles every decided segment (front/back/overall) of a set of Nassau-
 * style matchups into `bump` calls - shared by both Nassau and Match Play,
 * since they're the same game with different teams and different money.
 * A segment only pays once it's resolved (see isNassauSegmentResolved)
 * and only if it wasn't tied. `recordCard` gets the same numbers as
 * `bump`, just grouped by matchup/segment instead of by player, for the
 * Settlement screen's Bets tab.
 */
function settleMatchups(
  matchups: NassauState,
  amounts: NassauAmounts,
  totalHoles: number,
  betTypeName: 'Nassau' | 'Match Play',
  bump: (playerId: string, amount: number, label: string) => void,
  recordCard: (key: string, category: BetCard['category'], title: string, isPot: boolean, playerId: string, amount: number) => void
): void {
  for (const matchup of matchups) {
    // "Overall" means the whole round, whatever length that is - not a
    // hardcoded 18, or it could never settle in a 9-hole round (it would
    // sit waiting for 18 holes that don't exist). Front/back stay fixed
    // at 9: a 9-hole round has no back nine, so that segment simply never
    // reaches its requirement and never pays - which is correct, not a bug.
    // A 9-hole round's "Front 9" and "Overall" are the exact same nine
    // holes - paying both would be paying the same result twice. Back 9
    // can never resolve anyway (see above), so a 9-hole round settles
    // Front only; only an 18-hole round has three genuinely distinct
    // segments.
    const segments: Array<{ name: string; segment: NassauSegmentState; amount: number; required: number }> =
      totalHoles === 9
        ? [{ name: 'Front 9', segment: matchup.front, amount: amounts.front, required: NASSAU_HALF_HOLES }]
        : [
            { name: 'Front 9', segment: matchup.front, amount: amounts.front, required: NASSAU_HALF_HOLES },
            { name: 'Back 9', segment: matchup.back, amount: amounts.back, required: NASSAU_HALF_HOLES },
            { name: 'Overall', segment: matchup.overall, amount: amounts.overall, required: totalHoles },
          ];
    for (const { name, segment, amount, required } of segments) {
      if (amount <= 0 || segment.status === 0 || !isNassauSegmentResolved(segment, required)) continue;
      const winnerSideIsA = segment.status > 0;
      const winners = winnerSideIsA ? matchup.playerIdsA : matchup.playerIdsB;
      const losers = winnerSideIsA ? matchup.playerIdsB : matchup.playerIdsA;
      if (winners.length === 0 || losers.length === 0) continue;
      // Every line item names the side actually played against, so a
      // player's breakdown reads "Nassau Front 9 vs Team 2" whether they
      // won or lost it.
      const winnersOpponentLabel = winnerSideIsA ? matchup.labelB : matchup.labelA;
      const losersOpponentLabel = winnerSideIsA ? matchup.labelA : matchup.labelB;
      // Each losing player owes the segment amount once, in total - not once
      // per opponent on the other side. That total is pooled and split evenly
      // across the winning side, so equal-size sides reduce to the familiar
      // "$X a man" Nassau (every winner +amount, every loser -amount) no
      // matter how many players are on each team.
      const perWinnerShare = (amount * losers.length) / winners.length;
      const cardKey = `${betTypeName}-${matchup.idA}-${matchup.idB}-${name}`;
      const cardTitle = `${matchup.labelA} vs ${matchup.labelB} · ${name}`;
      for (const loserId of losers) {
        bump(loserId, -amount, `${betTypeName} ${name} vs ${losersOpponentLabel}`);
        recordCard(cardKey, betTypeName, cardTitle, false, loserId, -amount);
      }
      for (const winnerId of winners) {
        bump(winnerId, perWinnerShare, `${betTypeName} ${name} vs ${winnersOpponentLabel}`);
        recordCard(cardKey, betTypeName, cardTitle, false, winnerId, perWinnerShare);
      }
    }
  }
}

/**
 * Nets out every settled Nassau segment, every Match Play segment, every
 * Skins bet, and every Stroke Play bet into one $ amount per player - and,
 * alongside that, the same money regrouped by bet instead of by player
 * (see BetCard) for the Settlement screen's Bets/Pots tabs.
 */
function computeSettlement(
  players: Player[],
  nassau: NassauState,
  nassauAmounts: NassauAmounts,
  nassauPressResults: NassauPressResult[],
  matchPlay: NassauState,
  matchPlayAmounts: NassauAmounts,
  skins: SkinsState,
  skinsBets: SkinsBet[],
  strokePlay: StrokePlayState,
  strokePlayBets: StrokePlayBet[],
  birdies: BirdiesState,
  birdiesBets: BirdiesBet[],
  doubles: DoublesState,
  doublesBets: DoublesBet[],
  totalHoles: number
): { settlement: Settlement; betCards: BetCard[] } {
  const net = new Map<string, number>();
  const breakdown = new Map<string, SettlementLineItem[]>();
  const bump = (playerId: string, amount: number, label: string) => {
    net.set(playerId, (net.get(playerId) ?? 0) + amount);
    const items = breakdown.get(playerId) ?? [];
    items.push({ label, amount: Math.round(amount * 100) / 100 });
    breakdown.set(playerId, items);
  };

  const cardsByKey = new Map<
    string,
    { category: BetCard['category']; title: string; isPot: boolean; rows: Array<{ playerId: string; amount: number }> }
  >();
  const recordCard = (
    key: string,
    category: BetCard['category'],
    title: string,
    isPot: boolean,
    playerId: string,
    amount: number
  ) => {
    const card = cardsByKey.get(key) ?? { category, title, isPot, rows: [] };
    card.rows.push({ playerId, amount: Math.round(amount * 100) / 100 });
    cardsByKey.set(key, card);
  };

  settleMatchups(nassau, nassauAmounts, totalHoles, 'Nassau', bump, recordCard);
  settlePresses(nassauPressResults, nassau, nassauAmounts, bump, recordCard);
  settleMatchups(matchPlay, matchPlayAmounts, totalHoles, 'Match Play', bump, recordCard);

  const skinsBetById = new Map(skinsBets.map((bet) => [bet.id, bet]));
  for (const bet of skins) {
    const settings = skinsBetById.get(bet.betId);
    if (!settings || bet.totals.length < 2) continue;
    const eligibleCount = bet.totals.length;
    const totalSkinsWon = bet.totals.reduce((sum, total) => sum + total.skinsWon, 0);

    if (settings.payoutMode === 'pot') {
      // Pari-mutuel pot: every eligible player antes the buy-in regardless
      // of outcome, and that pot is split across however many skins
      // actually got won, paid out per skin. Nothing settles until at
      // least one skin has actually been decided - with none won yet
      // there's no way to know who the pot is even owed to.
      if (settings.buyIn <= 0 || totalSkinsWon === 0) continue;
      const pot = settings.buyIn * eligibleCount;
      const perSkinShare = pot / totalSkinsWon;
      for (const total of bet.totals) {
        const amount = perSkinShare * total.skinsWon - settings.buyIn;
        bump(total.id, amount, bet.name);
        recordCard(`skins-${bet.betId}`, 'Skins', bet.name, true, total.id, amount);
      }
    } else {
      // Flat $ per skin: every skin a player won is worth valuePerSkin
      // from every other player in the bet, computed directly rather
      // than simulated transaction-by-transaction.
      if (settings.valuePerSkin <= 0) continue;
      for (const total of bet.totals) {
        const amount = settings.valuePerSkin * (total.skinsWon * eligibleCount - totalSkinsWon);
        bump(total.id, amount, bet.name);
        recordCard(`skins-${bet.betId}`, 'Skins', bet.name, false, total.id, amount);
      }
    }
  }

  const strokePlayBetById = new Map(strokePlayBets.map((bet) => [bet.id, bet]));
  for (const bet of strokePlay) {
    const settings = strokePlayBetById.get(bet.betId);
    // Stroke Play only pays out once every entrant has finished the round -
    // final standings, not a live in-progress read, since a mid-round
    // total isn't a real result yet.
    if (!settings || !bet.resolved || bet.totals.length < 2) continue;

    if (settings.payoutMode === 'perStroke') {
      // Winner-take-all: only the outright winner (lowest score) is paid,
      // and only by everyone else - each other entrant pays the winner
      // their own stroke margin times the per-stroke value. Nothing
      // changes hands between two non-winning entrants, unlike Nassau's
      // pairwise model. Tied for the win splits the collected pot evenly.
      if (settings.valuePerStroke <= 0) continue;
      const lowest = bet.totals[0].toPar;
      const winners = bet.totals.filter((total) => total.toPar === lowest);
      const losers = bet.totals.filter((total) => total.toPar !== lowest);
      if (losers.length === 0) continue;
      for (const loser of losers) {
        const amount = settings.valuePerStroke * (loser.toPar - lowest);
        bump(loser.id, -amount, bet.name);
        recordCard(`strokeplay-${bet.betId}`, 'Stroke Play', bet.name, false, loser.id, -amount);
        const perWinnerShare = amount / winners.length;
        for (const winner of winners) {
          bump(winner.id, perWinnerShare, bet.name);
          recordCard(`strokeplay-${bet.betId}`, 'Stroke Play', bet.name, false, winner.id, perWinnerShare);
        }
      }
    } else if (settings.payoutMode === 'potWinner') {
      // Buy-in pot, winner take all - the whole pot goes to the low
      // score(s), split evenly if there's a tie for the lead.
      if (settings.buyIn <= 0) continue;
      const pot = settings.buyIn * bet.totals.length;
      const lowest = bet.totals[0].toPar;
      const winners = bet.totals.filter((total) => total.toPar === lowest);
      const share = pot / winners.length;
      for (const total of bet.totals) {
        const amount = (total.toPar === lowest ? share : 0) - settings.buyIn;
        bump(total.id, amount, bet.name);
        recordCard(`strokeplay-${bet.betId}`, 'Stroke Play', bet.name, true, total.id, amount);
      }
    } else {
      // Buy-in pot, split by finish - each entrant's share is weighted by
      // how many other entrants they beat, so the payout is top-heavy
      // without needing a fixed payout table for an arbitrary field size.
      // If everyone's tied, nobody beat anybody - skip rather than divide
      // by zero (equivalent to everyone simply getting their buy-in back).
      if (settings.buyIn <= 0) continue;
      const pot = settings.buyIn * bet.totals.length;
      const weights = bet.totals.map(
        (total) => bet.totals.filter((other) => other.toPar > total.toPar).length
      );
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      if (totalWeight === 0) continue;
      bet.totals.forEach((total, i) => {
        const amount = (weights[i] / totalWeight) * pot - settings.buyIn;
        bump(total.id, amount, bet.name);
        recordCard(`strokeplay-${bet.betId}`, 'Stroke Play', bet.name, true, total.id, amount);
      });
    }
  }

  // Birdies: flat $ per point (1 for a birdie, 2 for an eagle, ...),
  // computed directly the same way Skins' flat per-skin payout is -
  // every point a player earned is worth amountPerBirdie from every other
  // eligible player, so a player's net is their point share of the total
  // minus their own points, times eligibleCount.
  const birdiesBetById = new Map(birdiesBets.map((bet) => [bet.id, bet]));
  for (const bet of birdies) {
    const settings = birdiesBetById.get(bet.betId);
    if (!settings || settings.amountPerBirdie <= 0 || bet.totals.length < 2) continue;
    const eligibleCount = bet.totals.length;
    const totalPoints = bet.totals.reduce((sum, total) => sum + total.points, 0);
    for (const total of bet.totals) {
      const amount = settings.amountPerBirdie * (total.points * eligibleCount - totalPoints);
      bump(total.id, amount, bet.name);
      recordCard(`birdies-${bet.betId}`, 'Birdies', bet.name, false, total.id, amount);
    }
  }

  // Doubles: the mirror image of Birdies - every double a player has
  // costs them amountPerDouble from every other eligible player, so the
  // same closed-form formula applies with the sign flipped.
  const doublesBetById = new Map(doublesBets.map((bet) => [bet.id, bet]));
  for (const bet of doubles) {
    const settings = doublesBetById.get(bet.betId);
    if (!settings || settings.amountPerDouble <= 0 || bet.totals.length < 2) continue;
    const eligibleCount = bet.totals.length;
    const totalDoubles = bet.totals.reduce((sum, total) => sum + total.doubleCount, 0);
    for (const total of bet.totals) {
      const amount = settings.amountPerDouble * (totalDoubles - total.doubleCount * eligibleCount);
      bump(total.id, amount, bet.name);
      recordCard(`doubles-${bet.betId}`, 'Doubles', bet.name, false, total.id, amount);
    }
  }

  const nameById = new Map(players.map((player) => [player.id, player.name]));
  const settlement = Array.from(net.entries())
    .map(([id, amount]) => ({
      id,
      label: nameById.get(id) ?? 'Unknown',
      amount: Math.round(amount * 100) / 100,
      breakdown: breakdown.get(id) ?? [],
    }))
    .sort((a, b) => b.amount - a.amount);

  const betCards: BetCard[] = Array.from(cardsByKey.entries()).map(([key, card]) => ({
    key,
    category: card.category,
    title: card.title,
    isPot: card.isPot,
    rows: card.rows
      .map((row) => ({
        playerId: row.playerId,
        label: nameById.get(row.playerId) ?? 'Unknown',
        amount: row.amount,
      }))
      .sort((a, b) => b.amount - a.amount),
  }));

  return { settlement, betCards };
}

/**
 * Writes (or refreshes) this device's own history entry for a round, once
 * it's fully closed - self-authorized (a device can only ever write its
 * own uid's history, per the security rules), so there's no "who's
 * responsible for recording it" coordination needed between players. Silently
 * does nothing if this device's player was never a self-joined participant
 * in the round (no matching id in `settlement` - e.g. it was only added by
 * the host, by name, with no phone/uid of its own to save history under).
 * Best-effort: a failed write here never blocks or disrupts the round
 * itself, which is why it's fired with `void` from recomputeAll rather than
 * awaited.
 */
async function recordHistoryEntry(
  roundCode: string,
  uid: string,
  createdAt: number | null,
  courseName: string | null,
  totalHoles: number,
  allPlayers: Player[],
  settlement: Settlement,
  betCards: BetCard[]
): Promise<void> {
  const entry = settlement.find((e) => e.id === uid);
  if (!entry) return;
  const breakdown: HistoryBreakdownItem[] = betCards.flatMap((card) =>
    card.rows
      .filter((row) => row.playerId === uid)
      .map((row) => ({ category: card.category, label: card.title, amount: row.amount }))
  );
  const opponentNames = allPlayers.filter((player) => player.id !== uid).map((player) => player.name);
  const historyEntry: Omit<HistoryEntry, 'roundCode'> = {
    date: createdAt ?? Date.now(),
    courseName,
    totalHoles,
    opponentNames,
    amount: entry.amount,
    breakdown,
  };
  try {
    // update, not set: a merge, so any holeStats already written live
    // during play (see setHoleStat) isn't wiped out by this summary.
    await dbUpdate(ref(db, `players/${uid}/history/${roundCode}`), historyEntry);
  } catch {
    // Best-effort - history is a convenience record, never load-bearing for
    // the round itself.
  }
}

// Firebase RTDB keys can't contain '.', '#', '$', '[', ']', or '/' - and
// two different-looking names should still land on the same regular if
// they're really the same person (case, stray spaces), so every write and
// read of players/{uid}/regulars goes through this same normalization.
function regularKeyFor(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[.#$[\]/]/g, '_')
    .replace(/\s+/g, '_');
  return cleaned || 'player';
}

/**
 * Remembers everyone else in a just-closed round as one of this player's
 * own regulars - registered players and name-only ones alike, since a
 * regular is about who you played with, not whether they had the app.
 * Fires alongside recordHistoryEntry (same "once every bet is closed"
 * trigger), best-effort for the same reason: a golf buddy list is a
 * convenience, never load-bearing for the round itself.
 */
async function recordRegulars(uid: string, allPlayers: Player[], handicaps: PlayerHandicaps): Promise<void> {
  const others = allPlayers.filter((player) => player.id !== uid);
  if (others.length === 0) return;
  const lastPlayedAt = Date.now();
  const updates: Record<string, unknown> = {};
  for (const player of others) {
    const regular: RegularPlayer = {
      name: player.name,
      handicap18: handicaps[player.id] ?? null,
      lastPlayedAt,
    };
    updates[`players/${uid}/regulars/${regularKeyFor(player.name)}`] = regular;
  }
  try {
    await dbUpdate(ref(db), updates);
  } catch {
    // Best-effort, same as recordHistoryEntry above.
  }
}

// ---------- Snapshot parsing ----------

type PlayersSnapshotValue = Record<string, { name: string; joinedAt: number }> | null | undefined;

function playersFromSnapshotValue(value: PlayersSnapshotValue): Player[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, p]) => ({ id, name: p.name, joinedAt: p.joinedAt ?? 0 }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

type TeamsSnapshotValue = Record<string, { name: string; createdAt: number }> | null | undefined;

function teamsFromSnapshotValue(value: TeamsSnapshotValue): Team[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, t]) => ({ id, name: t.name, createdAt: t.createdAt ?? 0 }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

interface SkinsBetSnapshotValue {
  name?: string;
  carryover?: boolean;
  net?: boolean;
  payoutMode?: SkinsPayoutMode;
  valuePerSkin?: number;
  buyIn?: number;
  unit?: StakesUnit;
  createdAt?: number;
  players?: Record<string, true> | null;
}

function skinsBetsFromSnapshotValue(
  value: Record<string, SkinsBetSnapshotValue> | null
): SkinsBet[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, b]) => ({
      id,
      name: b.name ?? 'Skins',
      // Missing carryover means this bet predates carryover being a
      // per-bet setting - default to standard skins rules (carryover on).
      carryover: b.carryover === false ? false : true,
      // Missing net means this bet predates net scoring - default to
      // gross, its original (and only) behavior.
      net: b.net === true,
      // Missing payoutMode means this bet predates the pot option -
      // default to the original (and only) behavior, a flat $ per skin.
      payoutMode: (b.payoutMode === 'pot' ? 'pot' : 'perSkin') as SkinsPayoutMode,
      valuePerSkin: b.valuePerSkin ?? 0,
      buyIn: b.buyIn ?? 0,
      // Missing unit means this bet predates per-bet stakes units -
      // default to money.
      unit: (b.unit === 'drinks' ? 'drinks' : 'money') as StakesUnit,
      createdAt: b.createdAt ?? 0,
      playerIds: b.players ? Object.keys(b.players) : [],
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

interface StrokePlaySnapshotValue {
  name?: string;
  net?: boolean;
  payoutMode?: StrokePlayPayoutMode;
  valuePerStroke?: number;
  buyIn?: number;
  unit?: StakesUnit;
  createdAt?: number;
  players?: Record<string, true> | null;
}

function strokePlayBetsFromSnapshotValue(
  value: Record<string, StrokePlaySnapshotValue> | null
): StrokePlayBet[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, b]) => ({
      id,
      name: b.name ?? 'Stroke Play',
      net: b.net === true,
      payoutMode: (
        b.payoutMode === 'potWinner' || b.payoutMode === 'potFinish' ? b.payoutMode : 'perStroke'
      ) as StrokePlayPayoutMode,
      valuePerStroke: b.valuePerStroke ?? 0,
      buyIn: b.buyIn ?? 0,
      unit: (b.unit === 'drinks' ? 'drinks' : 'money') as StakesUnit,
      createdAt: b.createdAt ?? 0,
      playerIds: b.players ? Object.keys(b.players) : [],
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

interface BirdiesBetSnapshotValue {
  name?: string;
  net?: boolean;
  amountPerBirdie?: number;
  unit?: StakesUnit;
  createdAt?: number;
  players?: Record<string, true> | null;
}

function birdiesBetsFromSnapshotValue(
  value: Record<string, BirdiesBetSnapshotValue> | null
): BirdiesBet[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, b]) => ({
      id,
      name: b.name ?? 'Birdies',
      net: b.net === true,
      amountPerBirdie: b.amountPerBirdie ?? 0,
      unit: (b.unit === 'drinks' ? 'drinks' : 'money') as StakesUnit,
      createdAt: b.createdAt ?? 0,
      playerIds: b.players ? Object.keys(b.players) : [],
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

interface DoublesBetSnapshotValue {
  name?: string;
  net?: boolean;
  amountPerDouble?: number;
  unit?: StakesUnit;
  createdAt?: number;
  players?: Record<string, true> | null;
}

function doublesBetsFromSnapshotValue(
  value: Record<string, DoublesBetSnapshotValue> | null
): DoublesBet[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, b]) => ({
      id,
      name: b.name ?? 'Doubles',
      net: b.net === true,
      amountPerDouble: b.amountPerDouble ?? 0,
      unit: (b.unit === 'drinks' ? 'drinks' : 'money') as StakesUnit,
      createdAt: b.createdAt ?? 0,
      playerIds: b.players ? Object.keys(b.players) : [],
    }))
    .sort((a, b) => a.createdAt - b.createdAt);
}

interface GroupSnapshotValue {
  name?: string;
  createdAt?: number;
  players?: PlayersSnapshotValue;
  scores?: HoleScores;
  scoresSubmitted?: boolean;
}

function groupFromSnapshotEntry(id: string, value: GroupSnapshotValue): Group {
  return {
    id,
    name: value.name ?? 'Group',
    createdAt: value.createdAt ?? 0,
    players: playersFromSnapshotValue(value.players),
    scores: value.scores ?? {},
    scoresSubmitted: value.scoresSubmitted === true,
  };
}

function groupsFromSnapshotValue(value: Record<string, GroupSnapshotValue> | null): Group[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, g]) => groupFromSnapshotEntry(id, g))
    .sort((a, b) => a.createdAt - b.createdAt);
}

type CourseSnapshotValue = {
  name: string;
  totalHoles?: number;
  holes?: HolesInfo;
  tees?: TeeInfo[];
  notes?: string;
  createdBy: string;
  createdAt: number;
};

function coursesFromSnapshotValue(value: Record<string, CourseSnapshotValue> | null): CourseInfo[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, c]) => ({
      id,
      name: c.name,
      totalHoles: c.totalHoles === 9 ? 9 : 18,
      holes: c.holes ?? {},
      tees: c.tees,
      notes: c.notes,
      createdBy: c.createdBy,
      createdAt: c.createdAt ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type NassauPressCallSnapshotValue = {
  matchupKey: string;
  segment: NassauSegmentKey;
  startHole: number;
  calledBy: string;
  createdAt: number;
};

function nassauPressCallsFromSnapshotValue(
  value: Record<string, NassauPressCallSnapshotValue> | null
): NassauPressCall[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([id, c]) => ({
      id,
      matchupKey: c.matchupKey,
      segment: c.segment,
      startHole: c.startHole,
      calledBy: c.calledBy,
      createdAt: c.createdAt ?? 0,
    }))
    .sort((a, b) => a.startHole - b.startHole || a.createdAt - b.createdAt);
}

type HistorySnapshotValue = {
  date?: number;
  courseName?: string | null;
  totalHoles?: number;
  opponentNames?: string[];
  amount?: number;
  breakdown?: HistoryBreakdownItem[];
  holeStats?: Record<number, HoleStat>;
};

function historyFromSnapshotValue(value: Record<string, HistorySnapshotValue> | null): HistoryEntry[] {
  if (!value) return [];
  return Object.entries(value)
    .map(([roundCode, h]) => ({
      roundCode,
      date: h.date ?? 0,
      courseName: h.courseName ?? null,
      totalHoles: h.totalHoles ?? 18,
      opponentNames: h.opponentNames ?? [],
      amount: h.amount ?? 0,
      breakdown: h.breakdown ?? [],
      holeStats: h.holeStats ?? {},
    }))
    .sort((a, b) => b.date - a.date);
}

function holeStatsFromSnapshotValue(
  value: Record<string, Partial<HoleStat>> | null
): Record<number, HoleStat> {
  if (!value) return {};
  const result: Record<number, HoleStat> = {};
  for (const [hole, stat] of Object.entries(value)) {
    result[Number(hole)] = {
      fairway: stat.fairway ?? null,
      putts: stat.putts ?? null,
      gir: stat.gir ?? false,
    };
  }
  return result;
}

type RegularSnapshotValue = { name?: string; handicap18?: number | null; lastPlayedAt?: number };

function regularsFromSnapshotValue(value: Record<string, RegularSnapshotValue> | null): RegularPlayer[] {
  if (!value) return [];
  return Object.values(value)
    .map((r) => ({
      name: r.name ?? 'Player',
      handicap18: r.handicap18 ?? null,
      lastPlayedAt: r.lastPlayedAt ?? 0,
    }))
    .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

// Active Firebase listeners for the current round, so leaveRound() can
// detach them instead of leaking a subscription per round visited.
let detachHolesListener: (() => void) | null = null;
let detachCourseNameListener: (() => void) | null = null;
let detachGroupsListener: (() => void) | null = null;
let detachStatusListener: (() => void) | null = null;
let detachTeamsListener: (() => void) | null = null;
let detachPlayerTeamsListener: (() => void) | null = null;
let detachSkinsBetsListener: (() => void) | null = null;
let detachHandicapsListener: (() => void) | null = null;
let detachNassauNetListener: (() => void) | null = null;
let detachNassauStakesUnitListener: (() => void) | null = null;
let detachNassauAmountsListener: (() => void) | null = null;
let detachNassauAutoPressListener: (() => void) | null = null;
let detachNassauPressStackingListener: (() => void) | null = null;
let detachNassauPressCallsListener: (() => void) | null = null;
let detachTotalHolesListener: (() => void) | null = null;
let detachMatchPlayTeamsListener: (() => void) | null = null;
let detachMatchPlayPlayerTeamsListener: (() => void) | null = null;
let detachMatchPlayNetListener: (() => void) | null = null;
let detachMatchPlayStakesUnitListener: (() => void) | null = null;
let detachMatchPlayAmountsListener: (() => void) | null = null;
let detachStrokePlayBetsListener: (() => void) | null = null;
let detachBirdiesBetsListener: (() => void) | null = null;
let detachDoublesBetsListener: (() => void) | null = null;
let detachPayoutStatusListener: (() => void) | null = null;

function detachListeners() {
  if (detachHolesListener) {
    detachHolesListener();
    detachHolesListener = null;
  }
  if (detachCourseNameListener) {
    detachCourseNameListener();
    detachCourseNameListener = null;
  }
  if (detachGroupsListener) {
    detachGroupsListener();
    detachGroupsListener = null;
  }
  if (detachStatusListener) {
    detachStatusListener();
    detachStatusListener = null;
  }
  if (detachTeamsListener) {
    detachTeamsListener();
    detachTeamsListener = null;
  }
  if (detachPlayerTeamsListener) {
    detachPlayerTeamsListener();
    detachPlayerTeamsListener = null;
  }
  if (detachSkinsBetsListener) {
    detachSkinsBetsListener();
    detachSkinsBetsListener = null;
  }
  if (detachHandicapsListener) {
    detachHandicapsListener();
    detachHandicapsListener = null;
  }
  if (detachNassauNetListener) {
    detachNassauNetListener();
    detachNassauNetListener = null;
  }
  if (detachNassauStakesUnitListener) {
    detachNassauStakesUnitListener();
    detachNassauStakesUnitListener = null;
  }
  if (detachNassauAmountsListener) {
    detachNassauAmountsListener();
    detachNassauAmountsListener = null;
  }
  if (detachNassauAutoPressListener) {
    detachNassauAutoPressListener();
    detachNassauAutoPressListener = null;
  }
  if (detachNassauPressStackingListener) {
    detachNassauPressStackingListener();
    detachNassauPressStackingListener = null;
  }
  if (detachNassauPressCallsListener) {
    detachNassauPressCallsListener();
    detachNassauPressCallsListener = null;
  }
  if (detachTotalHolesListener) {
    detachTotalHolesListener();
    detachTotalHolesListener = null;
  }
  if (detachMatchPlayTeamsListener) {
    detachMatchPlayTeamsListener();
    detachMatchPlayTeamsListener = null;
  }
  if (detachMatchPlayPlayerTeamsListener) {
    detachMatchPlayPlayerTeamsListener();
    detachMatchPlayPlayerTeamsListener = null;
  }
  if (detachMatchPlayNetListener) {
    detachMatchPlayNetListener();
    detachMatchPlayNetListener = null;
  }
  if (detachMatchPlayStakesUnitListener) {
    detachMatchPlayStakesUnitListener();
    detachMatchPlayStakesUnitListener = null;
  }
  if (detachMatchPlayAmountsListener) {
    detachMatchPlayAmountsListener();
    detachMatchPlayAmountsListener = null;
  }
  if (detachStrokePlayBetsListener) {
    detachStrokePlayBetsListener();
    detachStrokePlayBetsListener = null;
  }
  if (detachBirdiesBetsListener) {
    detachBirdiesBetsListener();
    detachBirdiesBetsListener = null;
  }
  if (detachDoublesBetsListener) {
    detachDoublesBetsListener();
    detachDoublesBetsListener = null;
  }
  if (detachPayoutStatusListener) {
    detachPayoutStatusListener();
    detachPayoutStatusListener = null;
  }
}

// ---------- Store ----------

export const useRoundState = create<RoundState>((set, get) => ({
  roundCode: null,
  playerId: null,
  myGroupId: null,
  hostId: null,
  status: 'idle',
  roundStatus: 'prep',
  errorMessage: null,

  holes: {},
  groups: [],
  courseName: null,
  createdAt: null,
  handicaps: {},
  teams: [],
  playerTeams: {},
  nassauNet: false,
  nassauAmounts: { front: 0, back: 0, overall: 0 },
  nassauStakesUnit: 'money',
  nassauAutoPress: false,
  nassauPressStacking: 'single',
  nassauPressCalls: [],
  nassauPressResults: [],
  nassau: [],
  matchPlayTeams: [],
  matchPlayPlayerTeams: {},
  matchPlayNet: false,
  matchPlayAmounts: { front: 0, back: 0, overall: 0 },
  matchPlayStakesUnit: 'money',
  matchPlay: [],
  skinsBets: [],
  skins: [],
  strokePlayBets: [],
  strokePlay: [],
  birdiesBets: [],
  birdies: [],
  doublesBets: [],
  doubles: [],
  settlement: [],
  betCards: [],

  currentHole: 1,
  totalHoles: 9,
  scoringGroupId: null,

  previewRoundCode: null,
  previewGroups: [],

  profile: null,
  courses: [],
  history: [],
  myHoleStats: {},
  regulars: [],
  paymentHandles: null,
  paymentHandlesByUid: {},
  payoutStatus: {},
  historicalRound: null,
  historicalRoundLoading: false,
  historicalRoundError: null,

  createRound: async (hostName) => {
    set({ status: 'connecting', errorMessage: null });
    try {
      await ensureSignedIn();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign-in failed - try again.');

      // Pick a round code that isn't already taken.
      let code = generateRoundCode();
      for (let attempts = 0; attempts < 5; attempts += 1) {
        const snapshot = await dbGet(ref(db, `rounds/${code}`));
        if (!snapshot.exists()) break;
        code = generateRoundCode();
      }

      const groupRef = push(ref(db, `rounds/${code}/groups`));
      const groupId = groupRef.key as string;
      const joinedAt = Date.now();

      await dbSet(ref(db, `rounds/${code}`), {
        createdAt: joinedAt,
        status: 'prep',
        hostId: uid,
        groups: {
          [groupId]: {
            name: 'Tee Group 1',
            createdAt: joinedAt,
            players: { [uid]: { name: hostName, joinedAt } },
          },
        },
      });

      get()._subscribeToRound(code, groupId, uid);
    } catch (error) {
      set({ status: 'error', errorMessage: (error as Error).message });
      throw error;
    }
  },

  previewRound: async (codeInput) => {
    const code = codeInput.trim().toUpperCase();
    set({ status: 'connecting', errorMessage: null, previewRoundCode: null, previewGroups: [] });
    try {
      await ensureSignedIn();

      const snapshot = await dbGet(ref(db, `rounds/${code}`));
      if (!snapshot.exists()) {
        const message = `No round found with code ${code}`;
        set({ status: 'error', errorMessage: message });
        throw new Error(message);
      }

      const value = snapshot.val() as { groups?: Record<string, GroupSnapshotValue> } | null;
      const groupsValue = value?.groups ?? null;
      const previewGroups: GroupPreview[] = groupsValue
        ? Object.entries(groupsValue).map(([id, g]) => ({
            id,
            name: g.name ?? 'Group',
            playerCount: g.players ? Object.keys(g.players).length : 0,
            players: playersFromSnapshotValue(g.players),
          }))
        : [];

      set({ status: 'idle', errorMessage: null, previewRoundCode: code, previewGroups });
    } catch (error) {
      set((state) => ({
        status: 'error',
        errorMessage: state.errorMessage ?? (error as Error).message,
      }));
      throw error;
    }
  },

  joinGroup: async (codeInput, groupId, name) => {
    const code = codeInput.trim().toUpperCase();
    set({ status: 'connecting', errorMessage: null });
    try {
      await ensureSignedIn();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign-in failed - try again.');

      const groupsSnapshot = await dbGet(ref(db, `rounds/${code}/groups`));
      const resolvedName = dedupePlayerName(allPlayerNamesInGroupsSnapshot(groupsSnapshot.val()), name);

      await dbSet(ref(db, `rounds/${code}/groups/${groupId}/players/${uid}`), {
        name: resolvedName,
        joinedAt: Date.now(),
      });

      get()._subscribeToRound(code, groupId, uid);
      return resolvedName;
    } catch (error) {
      set((state) => ({
        status: 'error',
        errorMessage: state.errorMessage ?? (error as Error).message,
      }));
      throw error;
    }
  },

  createGroupAndJoin: async (codeInput, name, groupName) => {
    const code = codeInput.trim().toUpperCase();
    set({ status: 'connecting', errorMessage: null });
    try {
      await ensureSignedIn();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign-in failed - try again.');

      const existingSnapshot = await dbGet(ref(db, `rounds/${code}/groups`));
      const existingCount = existingSnapshot.exists() ? Object.keys(existingSnapshot.val()).length : 0;
      const resolvedName = dedupePlayerName(allPlayerNamesInGroupsSnapshot(existingSnapshot.val()), name);

      const groupRef = push(ref(db, `rounds/${code}/groups`));
      const groupId = groupRef.key as string;
      const joinedAt = Date.now();

      await dbSet(groupRef, {
        name: groupName?.trim() || `Tee Group ${existingCount + 1}`,
        createdAt: joinedAt,
        players: { [uid]: { name: resolvedName, joinedAt } },
      });

      get()._subscribeToRound(code, groupId, uid);
      return resolvedName;
    } catch (error) {
      set((state) => ({
        status: 'error',
        errorMessage: state.errorMessage ?? (error as Error).message,
      }));
      throw error;
    }
  },

  // Rekeys a name-only player (added via addPlayer - a push key, never a
  // real uid) onto this device's own uid. Two writes, not one: first a
  // small standalone update that adds this uid to the group's players
  // list and commits on its own, then a second multi-location update
  // that removes the ghost id and migrates everything it had (scores in
  // every group, not just this one - a player can be moved between
  // groups mid-round; handicaps; playerTeams/matchPlayPlayerTeams; every
  // skins/stroke play/birdies/doubles bet they were opted into) onto the
  // new uid. Splitting it this way matters: the scores write rule below
  // checks group membership, and doing the membership write and the
  // membership-gated writes in the very same multi-location update made
  // that check unreliable in practice. Afterward this device subscribes
  // to the round exactly like a normal join, now carrying everything
  // that ghost entry already had.
  claimPlayer: async (roundCode, groupId, ghostPlayerId) => {
    const code = roundCode.trim().toUpperCase();
    set({ status: 'connecting', errorMessage: null });
    try {
      await ensureSignedIn();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign-in failed - try again.');

      const snapshot = await dbGet(ref(db, `rounds/${code}`));
      if (!snapshot.exists()) throw new Error(`No round found with code ${code}`);
      const value = snapshot.val() as {
        groups?: Record<string, { players?: Record<string, { name: string; joinedAt: number }> } & GroupSnapshotValue>;
        handicaps?: Record<string, number>;
        playerTeams?: Record<string, string>;
        matchPlayPlayerTeams?: Record<string, string>;
        skinsBets?: Record<string, { players?: Record<string, true> }>;
        strokePlayBets?: Record<string, { players?: Record<string, true> }>;
        birdiesBets?: Record<string, { players?: Record<string, true> }>;
        doublesBets?: Record<string, { players?: Record<string, true> }>;
      };

      const ghost = value.groups?.[groupId]?.players?.[ghostPlayerId];
      if (!ghost) throw new Error('That player could not be found - they may have already been claimed.');

      const base = `rounds/${code}`;

      // Add this device's uid as a real player in the group FIRST, as its
      // own committed write, before touching anything gated on group
      // membership (scores). The scores write rule checks
      // groups/$groupId/players/{auth.uid}.exists() - if that check runs as
      // part of the very same multi-location update that ALSO adds this
      // membership, whether it sees the membership as already present is
      // exactly the kind of ambiguity that was silently breaking this flow.
      // Doing it as its own separate write first sidesteps that: by the
      // time the migration below runs, this device really is a player in
      // the group.
      await dbUpdate(ref(db), {
        [`${base}/groups/${groupId}/players/${uid}`]: { name: ghost.name, joinedAt: ghost.joinedAt },
      });

      const updates: Record<string, unknown> = {};
      updates[`${base}/groups/${groupId}/players/${ghostPlayerId}`] = null;

      // Scores can exist in any group the ghost entry was ever moved
      // through (movePlayerToGroup keeps the same id but doesn't drag
      // scores along), so every group is checked, not just this one.
      for (const [gid, group] of Object.entries(value.groups ?? {})) {
        const scores = (group as GroupSnapshotValue).scores;
        if (!scores) continue;
        for (const [hole, holeScores] of Object.entries(scores)) {
          const strokes = (holeScores as Record<string, number> | undefined)?.[ghostPlayerId];
          if (strokes == null) continue;
          updates[`${base}/groups/${gid}/scores/${hole}/${ghostPlayerId}`] = null;
          updates[`${base}/groups/${gid}/scores/${hole}/${uid}`] = strokes;
        }
      }

      if (value.handicaps?.[ghostPlayerId] != null) {
        updates[`${base}/handicaps/${ghostPlayerId}`] = null;
        updates[`${base}/handicaps/${uid}`] = value.handicaps[ghostPlayerId];
      }
      if (value.playerTeams?.[ghostPlayerId] != null) {
        updates[`${base}/playerTeams/${ghostPlayerId}`] = null;
        updates[`${base}/playerTeams/${uid}`] = value.playerTeams[ghostPlayerId];
      }
      if (value.matchPlayPlayerTeams?.[ghostPlayerId] != null) {
        updates[`${base}/matchPlayPlayerTeams/${ghostPlayerId}`] = null;
        updates[`${base}/matchPlayPlayerTeams/${uid}`] = value.matchPlayPlayerTeams[ghostPlayerId];
      }

      const betGroups: Array<[string, Record<string, { players?: Record<string, true> }> | undefined]> = [
        ['skinsBets', value.skinsBets],
        ['strokePlayBets', value.strokePlayBets],
        ['birdiesBets', value.birdiesBets],
        ['doublesBets', value.doublesBets],
      ];
      for (const [betPath, bets] of betGroups) {
        for (const [betId, bet] of Object.entries(bets ?? {})) {
          if (bet.players?.[ghostPlayerId]) {
            updates[`${base}/${betPath}/${betId}/players/${ghostPlayerId}`] = null;
            updates[`${base}/${betPath}/${betId}/players/${uid}`] = true;
          }
        }
      }

      await dbUpdate(ref(db), updates);

      get()._subscribeToRound(code, groupId, uid);
    } catch (error) {
      set((state) => ({
        status: 'error',
        errorMessage: state.errorMessage ?? (error as Error).message,
      }));
      throw error;
    }
  },

  rejoinRound: async (code, groupId) => {
    set({ status: 'connecting', errorMessage: null });
    try {
      await ensureSignedIn();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Sign-in failed - try again.');

      const snapshot = await dbGet(ref(db, `rounds/${code}/groups/${groupId}`));
      if (!snapshot.exists()) {
        await clearActiveRound();
        const message = 'That round is no longer available.';
        set({ status: 'error', errorMessage: message });
        throw new Error(message);
      }

      get()._subscribeToRound(code, groupId, uid);
    } catch (error) {
      set((state) => ({
        status: 'error',
        errorMessage: state.errorMessage ?? (error as Error).message,
      }));
      throw error;
    }
  },

  addPlayer: async (groupId, name) => {
    const { roundCode, groups } = get();
    if (!roundCode) return name;
    const existingNames = groups.flatMap((group) => group.players.map((player) => player.name));
    const resolvedName = dedupePlayerName(existingNames, name);
    const playerRef = push(ref(db, `rounds/${roundCode}/groups/${groupId}/players`));
    await dbSet(playerRef, { name: resolvedName, joinedAt: Date.now() });
    return resolvedName;
  },

  // Same as addPlayer, but for a saved regular - the generated player id
  // is known up front (push() returns its key before writing), so their
  // last-known handicap can be seeded in the same atomic update instead
  // of a separate write that could land before setPlayerHandicap's own
  // "already set" guard sees it.
  addRegularPlayer: async (groupId, regular) => {
    const { roundCode, groups } = get();
    if (!roundCode) return regular.name;
    const existingNames = groups.flatMap((group) => group.players.map((player) => player.name));
    const resolvedName = dedupePlayerName(existingNames, regular.name);
    const playerRef = push(ref(db, `rounds/${roundCode}/groups/${groupId}/players`));
    const playerId = playerRef.key as string;
    const updates: Record<string, unknown> = {
      [`rounds/${roundCode}/groups/${groupId}/players/${playerId}`]: { name: resolvedName, joinedAt: Date.now() },
    };
    if (regular.handicap18 != null) {
      updates[`rounds/${roundCode}/handicaps/${playerId}`] = regular.handicap18;
    }
    await dbUpdate(ref(db), updates);
    return resolvedName;
  },

  removePlayer: async (groupId, playerId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbRemove(ref(db, `rounds/${roundCode}/groups/${groupId}/players/${playerId}`));
    await dbRemove(ref(db, `rounds/${roundCode}/playerTeams/${playerId}`));
  },

  // Creates an empty tee group bucket within the round, without joining it -
  // the host can then move players into it (or other devices can join it
  // themselves later via the round code), rather than every player ending
  // up dumped into whichever single group the host happened to set up.
  createGroup: async (name) => {
    const { roundCode, groups } = get();
    if (!roundCode) throw new Error('Not in a round.');
    const groupRef = push(ref(db, `rounds/${roundCode}/groups`));
    const groupId = groupRef.key as string;
    await dbSet(groupRef, {
      name: name?.trim() || `Tee Group ${groups.length + 1}`,
      createdAt: Date.now(),
      players: {},
    });
    return groupId;
  },

  // Relocates a player from one tee group to another within the round.
  // Bet-team assignment (playerTeams) is round-level and unaffected by which
  // tee group a player is in, so moving tee groups never needs to touch it.
  movePlayerToGroup: async (playerId, fromGroupId, toGroupId) => {
    const { roundCode, groups } = get();
    if (!roundCode || fromGroupId === toGroupId) return;
    const fromGroup = groups.find((group) => group.id === fromGroupId);
    const player = fromGroup?.players.find((p) => p.id === playerId);
    if (!player) return;

    const newPlayerRef = push(ref(db, `rounds/${roundCode}/groups/${toGroupId}/players`));
    await dbSet(newPlayerRef, { name: player.name, joinedAt: player.joinedAt });
    await dbRemove(ref(db, `rounds/${roundCode}/groups/${fromGroupId}/players/${playerId}`));
  },

  setCurrentHole: (hole) => set({ currentHole: hole }),

  // Only meaningful for the host - everyone else always scores their own
  // group, but this lets enterScore stay simple (no separate "host mode"
  // flag): it just writes to whichever group is currently targeted.
  setScoringGroupId: (groupId) => set({ scoringGroupId: groupId }),

  enterScore: async (holeNumber, playerId, strokes) => {
    // A round can never legitimately record a hole in 0 (or fewer)
    // strokes - guard here, the one choke point every caller (manual
    // entry, the "fill blanks with par" step on Next, future callers)
    // writes through, so an invalid value can never reach Firebase no
    // matter where it was produced.
    if (!Number.isFinite(strokes) || strokes < 1) return;
    const { roundCode, myGroupId, scoringGroupId } = get();
    const targetGroupId = scoringGroupId ?? myGroupId;
    if (!roundCode || !targetGroupId) return;
    await dbSet(
      ref(db, `rounds/${roundCode}/groups/${targetGroupId}/scores/${holeNumber}/${playerId}`),
      strokes
    );
  },

  setHoleStat: async (holeNumber, fairway, putts) => {
    const { roundCode, myGroupId, playerId, holes, groups } = get();
    const uid = auth.currentUser?.uid;
    if (!roundCode || !playerId || !uid) return;
    const rawPar = holes[holeNumber]?.par;
    const par = rawPar != null && rawPar > 0 ? rawPar : 4;
    const myGroup = groups.find((group) => group.id === myGroupId);
    const strokes = myGroup?.scores[holeNumber]?.[playerId];
    // Standard GIR definition: reached the green (score minus putts) in
    // par minus 2 strokes or fewer. Derived, not tapped - see HoleStat.
    const gir = strokes != null && putts != null ? strokes - putts <= par - 2 : false;
    const stat: HoleStat = { fairway, putts, gir };
    set((state) => ({ myHoleStats: { ...state.myHoleStats, [holeNumber]: stat } }));
    try {
      // Private to this player - same path recordHistoryEntry merges its
      // summary into at round-close (see its dbUpdate comment).
      await dbSet(ref(db, `players/${uid}/history/${roundCode}/holeStats/${holeNumber}`), stat);
    } catch {
      // Best-effort, same as recordHistoryEntry - never blocks the round.
    }
  },

  setHoles: async (holes) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/holes`), holes);
  },

  setTotalHoles: async (totalHoles) => {
    const { roundCode, holes } = get();
    if (!roundCode) return;
    const writes: Promise<void>[] = [
      dbSet(ref(db, `rounds/${roundCode}/totalHoles`), totalHoles),
    ];
    // Only mirror the front 9 into the back 9 when the current hole data
    // actually calls for it: holes 10-18 are missing entirely (a 9-hole
    // scorecard), or the round's handicap indexes repeat 1-9 across both
    // nines (a 27-hole course where each nine was entered ranking its own
    // holes 1-9 independently). A genuine 18-hole course - every hole
    // already carrying its own unique index - is left exactly as entered.
    if (totalHoles === 18 && backNineNeedsMirroring(holes)) {
      const backNine: HolesInfo = {};
      for (let hole = 1; hole <= 9; hole += 1) {
        const front = holes[hole];
        if (!front) continue;
        backNine[hole + 9] = { par: front.par, handicapIndex: front.handicapIndex * 2 };
      }
      if (Object.keys(backNine).length > 0) {
        writes.push(dbSet(ref(db, `rounds/${roundCode}/holes`), { ...holes, ...backNine }));
      }
    }
    await Promise.all(writes);
  },

  submitGroupScores: async (groupId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/groups/${groupId}/scoresSubmitted`), true);
  },

  renameGroup: async (groupId, name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/groups/${groupId}/name`), name);
  },

  startRound: async () => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/status`), 'active');
  },

  // Bet teams live at the round level (not under any one tee group), since
  // a team can pair players from different tee groups together.
  createTeam: async (name) => {
    const { roundCode } = get();
    if (!roundCode) throw new Error('Not in a round.');
    const teamRef = push(ref(db, `rounds/${roundCode}/teams`));
    const teamId = teamRef.key as string;
    await dbSet(teamRef, { name, createdAt: Date.now() });
    return teamId;
  },

  renameTeam: async (teamId, name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/teams/${teamId}/name`), name);
  },

  deleteTeam: async (teamId) => {
    const { roundCode, playerTeams } = get();
    if (!roundCode) return;
    await dbRemove(ref(db, `rounds/${roundCode}/teams/${teamId}`));

    const removals = Object.entries(playerTeams)
      .filter(([, assignedTeamId]) => assignedTeamId === teamId)
      .map(([playerId]) => dbRemove(ref(db, `rounds/${roundCode}/playerTeams/${playerId}`)));
    await Promise.all(removals);
  },

  setPlayerTeam: async (playerId, teamId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    const path = ref(db, `rounds/${roundCode}/playerTeams/${playerId}`);
    if (teamId) {
      await dbSet(path, teamId);
    } else {
      await dbRemove(path);
    }
  },

  // Match Play is a second, independent Nassau-style bet - its teams live
  // under their own path so they don't collide with Nassau's.
  createMatchPlayTeam: async (name) => {
    const { roundCode } = get();
    if (!roundCode) throw new Error('Not in a round.');
    const teamRef = push(ref(db, `rounds/${roundCode}/matchPlayTeams`));
    const teamId = teamRef.key as string;
    await dbSet(teamRef, { name, createdAt: Date.now() });
    return teamId;
  },

  renameMatchPlayTeam: async (teamId, name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/matchPlayTeams/${teamId}/name`), name);
  },

  deleteMatchPlayTeam: async (teamId) => {
    const { roundCode, matchPlayPlayerTeams } = get();
    if (!roundCode) return;
    await dbRemove(ref(db, `rounds/${roundCode}/matchPlayTeams/${teamId}`));

    const removals = Object.entries(matchPlayPlayerTeams)
      .filter(([, assignedTeamId]) => assignedTeamId === teamId)
      .map(([playerId]) => dbRemove(ref(db, `rounds/${roundCode}/matchPlayPlayerTeams/${playerId}`)));
    await Promise.all(removals);
  },

  setMatchPlayPlayerTeam: async (playerId, teamId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    const path = ref(db, `rounds/${roundCode}/matchPlayPlayerTeams/${playerId}`);
    if (teamId) {
      await dbSet(path, teamId);
    } else {
      await dbRemove(path);
    }
  },

  // Skins bets live at the round level too, same as Nassau teams - each
  // one is its own independent pool that can pull players from any tee
  // group, and a player can be opted into more than one at once.
  createSkinsBet: async (name) => {
    const { roundCode, skinsBets } = get();
    if (!roundCode) throw new Error('Not in a round.');
    const betRef = push(ref(db, `rounds/${roundCode}/skinsBets`));
    const betId = betRef.key as string;
    await dbSet(betRef, {
      name: name?.trim() || `Skins ${skinsBets.length + 1}`,
      carryover: true,
      net: false,
      payoutMode: 'perSkin',
      valuePerSkin: 0,
      buyIn: 0,
      unit: 'money',
      createdAt: Date.now(),
    });
    return betId;
  },

  renameSkinsBet: async (betId, name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/skinsBets/${betId}/name`), name);
  },

  deleteSkinsBet: async (betId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbRemove(ref(db, `rounds/${roundCode}/skinsBets/${betId}`));
  },

  setSkinsBetCarryover: async (betId, carryover) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/skinsBets/${betId}/carryover`), carryover);
  },

  setSkinsBetNet: async (betId, net) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/skinsBets/${betId}/net`), net);
  },

  setSkinsBetValuePerSkin: async (betId, valuePerSkin) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/skinsBets/${betId}/valuePerSkin`), valuePerSkin);
  },

  setSkinsBetPayoutMode: async (betId, payoutMode) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/skinsBets/${betId}/payoutMode`), payoutMode);
  },

  setSkinsBetBuyIn: async (betId, buyIn) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/skinsBets/${betId}/buyIn`), buyIn);
  },

  setSkinsBetUnit: async (betId, unit) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/skinsBets/${betId}/unit`), unit);
  },

  setPlayerInSkinsBet: async (betId, playerId, inBet) => {
    const { roundCode } = get();
    if (!roundCode) return;
    const path = ref(db, `rounds/${roundCode}/skinsBets/${betId}/players/${playerId}`);
    if (inBet) {
      await dbSet(path, true);
    } else {
      await dbRemove(path);
    }
  },

  // Stroke Play bets live at the round level too, same shape as Skins -
  // each is its own independent pool that can pull players from any tee
  // group, and a player can be opted into more than one at once.
  createStrokePlayBet: async (name) => {
    const { roundCode, strokePlayBets } = get();
    if (!roundCode) throw new Error('Not in a round.');
    const betRef = push(ref(db, `rounds/${roundCode}/strokePlayBets`));
    const betId = betRef.key as string;
    await dbSet(betRef, {
      name: name?.trim() || `Stroke Play ${strokePlayBets.length + 1}`,
      net: false,
      payoutMode: 'perStroke',
      valuePerStroke: 0,
      buyIn: 0,
      unit: 'money',
      createdAt: Date.now(),
    });
    return betId;
  },

  renameStrokePlayBet: async (betId, name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/strokePlayBets/${betId}/name`), name);
  },

  deleteStrokePlayBet: async (betId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbRemove(ref(db, `rounds/${roundCode}/strokePlayBets/${betId}`));
  },

  setStrokePlayBetNet: async (betId, net) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/strokePlayBets/${betId}/net`), net);
  },

  setStrokePlayBetPayoutMode: async (betId, payoutMode) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/strokePlayBets/${betId}/payoutMode`), payoutMode);
  },

  setStrokePlayBetValuePerStroke: async (betId, valuePerStroke) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/strokePlayBets/${betId}/valuePerStroke`), valuePerStroke);
  },

  setStrokePlayBetBuyIn: async (betId, buyIn) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/strokePlayBets/${betId}/buyIn`), buyIn);
  },

  setStrokePlayBetUnit: async (betId, unit) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/strokePlayBets/${betId}/unit`), unit);
  },

  setPlayerInStrokePlayBet: async (betId, playerId, inBet) => {
    const { roundCode } = get();
    if (!roundCode) return;
    const path = ref(db, `rounds/${roundCode}/strokePlayBets/${betId}/players/${playerId}`);
    if (inBet) {
      await dbSet(path, true);
    } else {
      await dbRemove(path);
    }
  },

  // Birdies bets live at the round level too, same shape as Skins/Stroke
  // Play - each is its own independent pool that can pull players from
  // any tee group, and a player can be opted into more than one at once.
  createBirdiesBet: async (name) => {
    const { roundCode, birdiesBets } = get();
    if (!roundCode) throw new Error('Not in a round.');
    const betRef = push(ref(db, `rounds/${roundCode}/birdiesBets`));
    const betId = betRef.key as string;
    await dbSet(betRef, {
      name: name?.trim() || `Birdies ${birdiesBets.length + 1}`,
      net: false,
      amountPerBirdie: 0,
      unit: 'money',
      createdAt: Date.now(),
    });
    return betId;
  },

  renameBirdiesBet: async (betId, name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/birdiesBets/${betId}/name`), name);
  },

  deleteBirdiesBet: async (betId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbRemove(ref(db, `rounds/${roundCode}/birdiesBets/${betId}`));
  },

  setBirdiesBetNet: async (betId, net) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/birdiesBets/${betId}/net`), net);
  },

  setBirdiesBetAmount: async (betId, amountPerBirdie) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/birdiesBets/${betId}/amountPerBirdie`), amountPerBirdie);
  },

  setBirdiesBetUnit: async (betId, unit) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/birdiesBets/${betId}/unit`), unit);
  },

  setPlayerInBirdiesBet: async (betId, playerId, inBet) => {
    const { roundCode } = get();
    if (!roundCode) return;
    const path = ref(db, `rounds/${roundCode}/birdiesBets/${betId}/players/${playerId}`);
    if (inBet) {
      await dbSet(path, true);
    } else {
      await dbRemove(path);
    }
  },

  // Doubles bets live at the round level too, same shape as Birdies.
  createDoublesBet: async (name) => {
    const { roundCode, doublesBets } = get();
    if (!roundCode) throw new Error('Not in a round.');
    const betRef = push(ref(db, `rounds/${roundCode}/doublesBets`));
    const betId = betRef.key as string;
    await dbSet(betRef, {
      name: name?.trim() || `Doubles ${doublesBets.length + 1}`,
      net: false,
      amountPerDouble: 0,
      unit: 'money',
      createdAt: Date.now(),
    });
    return betId;
  },

  renameDoublesBet: async (betId, name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/doublesBets/${betId}/name`), name);
  },

  deleteDoublesBet: async (betId) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbRemove(ref(db, `rounds/${roundCode}/doublesBets/${betId}`));
  },

  setDoublesBetNet: async (betId, net) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/doublesBets/${betId}/net`), net);
  },

  setDoublesBetAmount: async (betId, amountPerDouble) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/doublesBets/${betId}/amountPerDouble`), amountPerDouble);
  },

  setDoublesBetUnit: async (betId, unit) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/doublesBets/${betId}/unit`), unit);
  },

  setPlayerInDoublesBet: async (betId, playerId, inBet) => {
    const { roundCode } = get();
    if (!roundCode) return;
    const path = ref(db, `rounds/${roundCode}/doublesBets/${betId}/players/${playerId}`);
    if (inBet) {
      await dbSet(path, true);
    } else {
      await dbRemove(path);
    }
  },

  // Nassau is a single round-wide bet (unlike Skins), so its net-scoring
  // flag and dollar amounts live directly on the round rather than nested
  // under a bet id.
  setNassauNet: async (net) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/nassauNet`), net);
  },

  setNassauStakesUnit: async (unit) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/nassauStakesUnit`), unit);
  },

  setNassauAmount: async (segment, amount) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/nassauAmounts/${segment}`), amount);
  },

  setNassauAutoPress: async (enabled) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/nassauAutoPress`), enabled);
  },

  setNassauPressStacking: async (mode) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/nassauPressStacking`), mode);
  },

  // Anyone in the round can call a press for either side of a matchup -
  // same trust model as the rest of round setup. Presses get called out
  // loud on the course, not gated by who's holding which phone.
  //
  // startHole is never taken from whichever hole the caller's device
  // happens to be sitting on - it's computed as the first hole in the
  // segment that doesn't have both sides scored yet, so a press only ever
  // covers holes still actually left to play. Calling it from a hole
  // that's already decided (or re-tapping after the segment is fully
  // played) can't retroactively fold an already-settled hole into the new
  // side bet, and a fully-played segment simply can't be pressed at all.
  callNassauPress: async (matchupKey, segment) => {
    const { roundCode, playerId, nassau, groups, totalHoles } = get();
    if (!roundCode || !playerId) return;
    const matchup = nassau.find((m) => `${m.idA}|${m.idB}` === matchupKey);
    if (!matchup) return;
    const range = nassauSegmentRange(segment, totalHoles);
    if (!range) return;
    const scores = mergeGroupScores(groups);
    let startHole: number | null = null;
    for (let hole = range.start; hole <= range.end; hole += 1) {
      const holeScores = scores[hole];
      const aScore = sideHoleScore(matchup.playerIdsA, holeScores);
      const bScore = sideHoleScore(matchup.playerIdsB, holeScores);
      if (aScore == null || bScore == null) {
        startHole = hole;
        break;
      }
    }
    if (startHole == null) return;
    const callRef = push(ref(db, `rounds/${roundCode}/nassauPresses`));
    await dbSet(callRef, {
      matchupKey,
      segment,
      startHole,
      calledBy: playerId,
      createdAt: Date.now(),
    });
  },

  // Match Play's net-scoring flag and dollar amounts live directly on the
  // round too, same as Nassau's, just under their own path.
  setMatchPlayNet: async (net) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/matchPlayNet`), net);
  },

  setMatchPlayStakesUnit: async (unit) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/matchPlayStakesUnit`), unit);
  },

  setMatchPlayAmount: async (segment, amount) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/matchPlayAmounts/${segment}`), amount);
  },

  setPlayerHandicap: async (playerId, handicap) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/handicaps/${playerId}`), handicap);
  },

  leaveRound: () => {
    detachListeners();
    void clearActiveRound();
    set({
      roundCode: null,
      playerId: null,
      myGroupId: null,
      hostId: null,
      status: 'idle',
      roundStatus: 'prep',
      errorMessage: null,
      holes: {},
      groups: [],
      courseName: null,
      createdAt: null,
      handicaps: {},
      teams: [],
      playerTeams: {},
      nassauNet: false,
      nassauAmounts: { front: 0, back: 0, overall: 0 },
      nassauStakesUnit: 'money',
      nassauAutoPress: false,
      nassauPressStacking: 'single',
      nassauPressCalls: [],
      nassauPressResults: [],
      nassau: [],
      matchPlayTeams: [],
      matchPlayPlayerTeams: {},
      matchPlayNet: false,
      matchPlayAmounts: { front: 0, back: 0, overall: 0 },
      matchPlayStakesUnit: 'money',
      matchPlay: [],
      skinsBets: [],
      skins: [],
      strokePlayBets: [],
      strokePlay: [],
      birdiesBets: [],
      birdies: [],
      doublesBets: [],
      doubles: [],
      settlement: [],
      betCards: [],
      currentHole: 1,
      totalHoles: 9,
      scoringGroupId: null,
      previewRoundCode: null,
      previewGroups: [],
      payoutStatus: {},
      paymentHandlesByUid: {},
      myHoleStats: {},
    });
  },

  setCourseName: async (name) => {
    const { roundCode } = get();
    if (!roundCode) return;
    await dbSet(ref(db, `rounds/${roundCode}/courseName`), name);
  },

  loadProfile: async () => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const snapshot = await dbGet(ref(db, `players/${uid}/profile`));
    const value = snapshot.val() as {
      displayName?: string;
      handicap18?: number;
      handicapType?: HandicapType;
      updatedAt?: number;
      isAdmin?: boolean;
    } | null;
    set({
      profile:
        value?.displayName || value?.handicap18 != null
          ? {
              displayName: value.displayName ?? '',
              handicap18: value.handicap18 ?? null,
              handicapType: value.handicapType ?? null,
              updatedAt: value.updatedAt ?? 0,
              isAdmin: value.isAdmin === true,
            }
          : null,
    });
  },

  setDisplayName: async (name) => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updatedAt = Date.now();
    // A merge (not a full overwrite) so this never clobbers other fields
    // already saved on the same profile node.
    await dbUpdate(ref(db, `players/${uid}/profile`), { displayName: name, updatedAt });
    set((state) => ({
      profile: {
        displayName: name,
        handicap18: state.profile?.handicap18 ?? null,
        handicapType: state.profile?.handicapType ?? null,
        updatedAt,
        isAdmin: state.profile?.isAdmin ?? false,
      },
    }));
  },

  setHandicap18: async (handicap18) => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updatedAt = Date.now();
    await dbUpdate(ref(db, `players/${uid}/profile`), { handicap18, updatedAt });
    set((state) => ({
      profile: {
        displayName: state.profile?.displayName ?? '',
        handicap18,
        handicapType: state.profile?.handicapType ?? null,
        updatedAt,
        isAdmin: state.profile?.isAdmin ?? false,
      },
    }));
  },

  setHandicapType: async (handicapType) => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updatedAt = Date.now();
    await dbUpdate(ref(db, `players/${uid}/profile`), { handicapType, updatedAt });
    set((state) => ({
      profile: {
        displayName: state.profile?.displayName ?? '',
        handicap18: state.profile?.handicap18 ?? null,
        handicapType,
        updatedAt,
        isAdmin: state.profile?.isAdmin ?? false,
      },
    }));
  },

  loadPaymentHandles: async () => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const snapshot = await dbGet(ref(db, `paymentHandles/${uid}`));
    const value = snapshot.val() as Partial<PaymentHandles> | null;
    set({
      paymentHandles: value
        ? {
            venmo: value.venmo ?? null,
            paypal: value.paypal ?? null,
            cashapp: value.cashapp ?? null,
            zelle: value.zelle ?? null,
            otherLabel: value.otherLabel ?? null,
            otherValue: value.otherValue ?? null,
            updatedAt: value.updatedAt ?? 0,
          }
        : null,
    });
  },

  // A merge (like setDisplayName etc.) so saving just the Venmo field never
  // touches the others. Any field explicitly passed as null clears that
  // handle - Firebase's update() deletes a child written as null, which is
  // exactly "no handle saved" here.
  savePaymentHandles: async (update) => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const updatedAt = Date.now();
    await dbUpdate(ref(db, `paymentHandles/${uid}`), { ...update, updatedAt });
    set((state) => ({
      paymentHandles: {
        venmo: state.paymentHandles?.venmo ?? null,
        paypal: state.paymentHandles?.paypal ?? null,
        cashapp: state.paymentHandles?.cashapp ?? null,
        zelle: state.paymentHandles?.zelle ?? null,
        otherLabel: state.paymentHandles?.otherLabel ?? null,
        otherValue: state.paymentHandles?.otherValue ?? null,
        ...update,
        updatedAt,
      },
    }));
  },

  // One-time batch lookup (not a live listener - these rarely change
  // mid-round and the Settlement screen re-calls this on demand) of other
  // round players' payment handles, so the payout plan can show "pay via
  // X" buttons. Players who never saved any handles (including anyone
  // added by the host who isn't on the app themselves) simply have no
  // entry, and the UI degrades to showing the amount with no pay button.
  loadPaymentHandlesForPlayers: async (uids) => {
    const uniqueUids = Array.from(new Set(uids));
    if (uniqueUids.length === 0) return;
    const snapshots = await Promise.all(
      uniqueUids.map((playerUid) => dbGet(ref(db, `paymentHandles/${playerUid}`)))
    );
    set((state) => {
      const paymentHandlesByUid = { ...state.paymentHandlesByUid };
      uniqueUids.forEach((playerUid, index) => {
        const value = snapshots[index].val() as Partial<PaymentHandles> | null;
        if (value) {
          paymentHandlesByUid[playerUid] = {
            venmo: value.venmo ?? null,
            paypal: value.paypal ?? null,
            cashapp: value.cashapp ?? null,
            zelle: value.zelle ?? null,
            otherLabel: value.otherLabel ?? null,
            otherValue: value.otherValue ?? null,
            updatedAt: value.updatedAt ?? 0,
          };
        } else {
          delete paymentHandlesByUid[playerUid];
        }
      });
      return { paymentHandlesByUid };
    });
  },

  // Only the payer can ever mark their own side sent (database.rules.json
  // enforces this too - this local uid check just avoids a doomed write).
  // No local set() needed for the live round: the payoutStatus listener
  // from _subscribeToRound picks up the change and updates every device,
  // including this one. A History caller passes its own roundCode (a
  // past round is never the live one in this store) and updates its own
  // historicalRound copy directly, since nothing subscribes it here.
  markPayoutSent: async (fromId, toId, sent, roundCodeOverride) => {
    const roundCode = roundCodeOverride ?? get().roundCode;
    if (!roundCode) return;
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid || uid !== fromId) return;
    const txId = `${fromId}_${toId}`;
    const sentAt = sent ? Date.now() : null;
    await dbUpdate(ref(db, `rounds/${roundCode}/payoutStatus/${txId}`), {
      sentByPayer: sent,
      sentAt,
    });
    if (roundCodeOverride) {
      set((state) =>
        state.historicalRound && state.historicalRound.roundCode === roundCodeOverride
          ? {
              historicalRound: {
                ...state.historicalRound,
                payoutStatus: {
                  ...state.historicalRound.payoutStatus,
                  [txId]: {
                    sentByPayer: sent,
                    sentAt,
                    confirmedByPayee: state.historicalRound.payoutStatus[txId]?.confirmedByPayee ?? false,
                    confirmedAt: state.historicalRound.payoutStatus[txId]?.confirmedAt ?? null,
                  },
                },
              },
            }
          : {}
      );
    }
  },

  // Mirror of markPayoutSent for the payee's side of the same transaction.
  markPayoutConfirmed: async (fromId, toId, confirmed, roundCodeOverride) => {
    const roundCode = roundCodeOverride ?? get().roundCode;
    if (!roundCode) return;
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid || uid !== toId) return;
    const txId = `${fromId}_${toId}`;
    const confirmedAt = confirmed ? Date.now() : null;
    await dbUpdate(ref(db, `rounds/${roundCode}/payoutStatus/${txId}`), {
      confirmedByPayee: confirmed,
      confirmedAt,
    });
    if (roundCodeOverride) {
      set((state) =>
        state.historicalRound && state.historicalRound.roundCode === roundCodeOverride
          ? {
              historicalRound: {
                ...state.historicalRound,
                payoutStatus: {
                  ...state.historicalRound.payoutStatus,
                  [txId]: {
                    sentByPayer: state.historicalRound.payoutStatus[txId]?.sentByPayer ?? false,
                    sentAt: state.historicalRound.payoutStatus[txId]?.sentAt ?? null,
                    confirmedByPayee: confirmed,
                    confirmedAt,
                  },
                },
              },
            }
          : {}
      );
    }
  },

  // One-time fetch of a past round's full node, computed into the same
  // settlement shape the live round produces (see recomputeAll below) -
  // reads never expire under database.rules.json's round-level
  // ".read": "auth != null", so this works for any round still on record
  // regardless of how long ago it closed.
  loadHistoricalRound: async (roundCode) => {
    set({ historicalRoundLoading: true, historicalRoundError: null, historicalRound: null });
    try {
      await ensureSignedIn();
      const snapshot = await dbGet(ref(db, `rounds/${roundCode}`));
      if (!snapshot.exists()) {
        set({ historicalRoundLoading: false, historicalRoundError: 'This round could no longer be found.' });
        return;
      }
      const value = snapshot.val() as {
        createdAt?: number;
        courseName?: string | null;
        holes?: HolesInfo;
        groups?: Record<string, GroupSnapshotValue>;
        teams?: TeamsSnapshotValue;
        playerTeams?: PlayerTeams;
        skinsBets?: unknown;
        handicaps?: PlayerHandicaps;
        nassauNet?: boolean;
        nassauAmounts?: Partial<NassauAmounts>;
        nassauAutoPress?: boolean;
        nassauPressStacking?: PressStackingMode;
        nassauPresses?: unknown;
        totalHoles?: number;
        matchPlayTeams?: TeamsSnapshotValue;
        matchPlayPlayerTeams?: PlayerTeams;
        matchPlayNet?: boolean;
        matchPlayAmounts?: Partial<NassauAmounts>;
        strokePlayBets?: unknown;
        birdiesBets?: unknown;
        doublesBets?: unknown;
        payoutStatus?: Record<string, Partial<PayoutStatusEntry> | undefined>;
      } | null;

      const holes: HolesInfo = value?.holes ?? {};
      const courseName = value?.courseName ?? null;
      const groups = groupsFromSnapshotValue(value?.groups ?? null);
      const teams = teamsFromSnapshotValue(value?.teams);
      const playerTeams = value?.playerTeams ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const skinsBets = skinsBetsFromSnapshotValue(value?.skinsBets as any);
      const handicaps = value?.handicaps ?? {};
      const nassauNet = value?.nassauNet === true;
      const nassauAmounts: NassauAmounts = {
        front: value?.nassauAmounts?.front ?? 0,
        back: value?.nassauAmounts?.back ?? 0,
        overall: value?.nassauAmounts?.overall ?? 0,
      };
      const nassauAutoPress = value?.nassauAutoPress === true;
      const nassauPressStacking: PressStackingMode =
        value?.nassauPressStacking === 'unlimited' || value?.nassauPressStacking === 'none'
          ? value.nassauPressStacking
          : 'single';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nassauPressCalls = nassauPressCallsFromSnapshotValue(value?.nassauPresses as any);
      const totalHoles = value?.totalHoles === 18 ? 18 : 9;
      const matchPlayTeams = teamsFromSnapshotValue(value?.matchPlayTeams);
      const matchPlayPlayerTeams = value?.matchPlayPlayerTeams ?? {};
      const matchPlayNet = value?.matchPlayNet === true;
      const matchPlayAmounts: NassauAmounts = {
        front: value?.matchPlayAmounts?.front ?? 0,
        back: value?.matchPlayAmounts?.back ?? 0,
        overall: value?.matchPlayAmounts?.overall ?? 0,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const strokePlayBets = strokePlayBetsFromSnapshotValue(value?.strokePlayBets as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const birdiesBets = birdiesBetsFromSnapshotValue(value?.birdiesBets as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doublesBets = doublesBetsFromSnapshotValue(value?.doublesBets as any);

      const payoutStatusRaw = value?.payoutStatus ?? {};
      const payoutStatus: Record<string, PayoutStatusEntry> = {};
      for (const [txId, entry] of Object.entries(payoutStatusRaw)) {
        payoutStatus[txId] = {
          sentByPayer: entry?.sentByPayer === true,
          sentAt: entry?.sentAt ?? null,
          confirmedByPayee: entry?.confirmedByPayee === true,
          confirmedAt: entry?.confirmedAt ?? null,
        };
      }

      const allPlayers = groups.flatMap((group) => group.players);
      const grossScores = mergeGroupScores(groups);
      const netScores = toNetScores(grossScores, holes, handicaps, allPlayers, totalHoles);
      const playerGroupId = new Map<string, string>();
      for (const group of groups) {
        for (const player of group.players) {
          playerGroupId.set(player.id, group.id);
        }
      }
      const nassau = computeNassau(
        allPlayers,
        nassauNet ? netScores : grossScores,
        teams,
        playerTeams,
        totalHoles,
        playerGroupId
      );
      const nassauPressResults = computeNassauPressResults(
        nassau,
        nassauNet ? netScores : grossScores,
        totalHoles,
        nassauAutoPress,
        nassauPressStacking,
        nassauPressCalls
      );
      const matchPlay = computeNassau(
        allPlayers,
        matchPlayNet ? netScores : grossScores,
        matchPlayTeams,
        matchPlayPlayerTeams,
        totalHoles
      );
      const skins = computeSkins(allPlayers, grossScores, netScores, skinsBets, totalHoles);
      const strokePlay = computeStrokePlay(allPlayers, grossScores, netScores, holes, strokePlayBets, totalHoles);
      const birdies = computeBirdies(allPlayers, grossScores, netScores, holes, birdiesBets, totalHoles);
      const doubles = computeDoubles(allPlayers, grossScores, netScores, holes, doublesBets, totalHoles);
      const { settlement, betCards } = computeSettlement(
        allPlayers,
        nassau,
        nassauAmounts,
        nassauPressResults,
        matchPlay,
        matchPlayAmounts,
        skins,
        skinsBets,
        strokePlay,
        strokePlayBets,
        birdies,
        birdiesBets,
        doubles,
        doublesBets,
        totalHoles
      );

      set({
        historicalRound: {
          roundCode,
          courseName,
          totalHoles,
          createdAt: value?.createdAt ?? null,
          holes,
          groups,
          handicaps,
          settlement,
          betCards,
          payoutStatus,
        },
        historicalRoundLoading: false,
      });
    } catch (error) {
      set({ historicalRoundLoading: false, historicalRoundError: (error as Error).message });
    }
  },

  // Only payoutStatus needs to stay live once historicalRound is loaded -
  // everything else about a closed round is frozen, but both the payer and
  // payee may be looking at the same past round's payout plan from their
  // own History at the same time.
  subscribeToHistoricalPayoutStatus: (roundCode) => {
    const payoutStatusRef = ref(db, `rounds/${roundCode}/payoutStatus`);
    const detach = onValue(payoutStatusRef, (snapshot) => {
      const value = (snapshot.val() ?? {}) as Record<string, Partial<PayoutStatusEntry> | undefined>;
      const payoutStatus: Record<string, PayoutStatusEntry> = {};
      for (const [txId, entry] of Object.entries(value)) {
        payoutStatus[txId] = {
          sentByPayer: entry?.sentByPayer === true,
          sentAt: entry?.sentAt ?? null,
          confirmedByPayee: entry?.confirmedByPayee === true,
          confirmedAt: entry?.confirmedAt ?? null,
        };
      }
      set((state) =>
        state.historicalRound && state.historicalRound.roundCode === roundCode
          ? { historicalRound: { ...state.historicalRound, payoutStatus } }
          : {}
      );
    });
    return () => detach();
  },

  clearHistoricalRound: () => {
    set({ historicalRound: null, historicalRoundLoading: false, historicalRoundError: null });
  },

  // Anyone can write one (own name attached, but nothing else about the
  // round or device); only a profile with isAdmin can ever read them
  // back, enforced by database.rules.json rather than by hiding a screen.
  submitFeedback: async (text) => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    const trimmed = text.trim();
    if (!uid || !trimmed) return;
    await dbSet(push(ref(db, 'feedback')), {
      text: trimmed,
      byUid: uid,
      byName: get().profile?.displayName ?? null,
      createdAt: Date.now(),
    });
  },

  fetchFeedback: async () => {
    await ensureSignedIn();
    const snapshot = await dbGet(ref(db, 'feedback'));
    const value = (snapshot.val() ?? {}) as Record<
      string,
      { text: string; byUid: string; byName: string | null; createdAt: number }
    >;
    return Object.entries(value)
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  loadCourses: async () => {
    await ensureSignedIn();
    const snapshot = await dbGet(ref(db, 'courses'));
    set({ courses: coursesFromSnapshotValue(snapshot.val()) });
  },

  saveCourse: async (name, holes, totalHoles, tees, notes) => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Sign-in failed - try again.');
    const courseRef = push(ref(db, 'courses'));
    const id = courseRef.key as string;
    const createdAt = Date.now();
    // Firebase rejects `undefined` values outright, so only include tees/
    // notes when there's actually something to save rather than passing
    // them through unconditionally.
    const cleanTees = tees && tees.length > 0 ? tees : undefined;
    const payload: CourseSnapshotValue = { name, totalHoles, holes, createdBy: uid, createdAt };
    if (cleanTees) payload.tees = cleanTees;
    if (notes) payload.notes = notes;
    await dbSet(courseRef, payload);
    set((state) => ({
      courses: [
        ...state.courses,
        { id, name, totalHoles, holes, tees: cleanTees, notes, createdBy: uid, createdAt },
      ].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return id;
  },

  applyCourse: async (courseId) => {
    const { roundCode, courses } = get();
    if (!roundCode) return;
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    await Promise.all([
      dbSet(ref(db, `rounds/${roundCode}/holes`), course.holes),
      dbSet(ref(db, `rounds/${roundCode}/totalHoles`), course.totalHoles),
      dbSet(ref(db, `rounds/${roundCode}/courseName`), course.name),
    ]);
  },

  loadHistory: async () => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      set({ history: [] });
      return;
    }
    const snapshot = await dbGet(ref(db, `players/${uid}/history`));
    set({ history: historyFromSnapshotValue(snapshot.val()) });
  },

  loadRegulars: async () => {
    await ensureSignedIn();
    const uid = auth.currentUser?.uid;
    if (!uid) {
      set({ regulars: [] });
      return;
    }
    const snapshot = await dbGet(ref(db, `players/${uid}/regulars`));
    set({ regulars: regularsFromSnapshotValue(snapshot.val()) });
  },

  _subscribeToRound: (code, groupId, uid) => {
    detachListeners();
    void persistActiveRound(code, groupId);

    const holesRef = ref(db, `rounds/${code}/holes`);
    const courseNameRef = ref(db, `rounds/${code}/courseName`);
    const groupsRef = ref(db, `rounds/${code}/groups`);
    const statusRef = ref(db, `rounds/${code}/status`);
    const teamsRef = ref(db, `rounds/${code}/teams`);
    const playerTeamsRef = ref(db, `rounds/${code}/playerTeams`);
    const skinsBetsRef = ref(db, `rounds/${code}/skinsBets`);
    const handicapsRef = ref(db, `rounds/${code}/handicaps`);
    const nassauNetRef = ref(db, `rounds/${code}/nassauNet`);
    const nassauStakesUnitRef = ref(db, `rounds/${code}/nassauStakesUnit`);
    const nassauAmountsRef = ref(db, `rounds/${code}/nassauAmounts`);
    const nassauAutoPressRef = ref(db, `rounds/${code}/nassauAutoPress`);
    const nassauPressStackingRef = ref(db, `rounds/${code}/nassauPressStacking`);
    const nassauPressCallsRef = ref(db, `rounds/${code}/nassauPresses`);
    const totalHolesRef = ref(db, `rounds/${code}/totalHoles`);
    const matchPlayTeamsRef = ref(db, `rounds/${code}/matchPlayTeams`);
    const matchPlayPlayerTeamsRef = ref(db, `rounds/${code}/matchPlayPlayerTeams`);
    const matchPlayNetRef = ref(db, `rounds/${code}/matchPlayNet`);
    const matchPlayStakesUnitRef = ref(db, `rounds/${code}/matchPlayStakesUnit`);
    const matchPlayAmountsRef = ref(db, `rounds/${code}/matchPlayAmounts`);
    const strokePlayBetsRef = ref(db, `rounds/${code}/strokePlayBets`);
    const birdiesBetsRef = ref(db, `rounds/${code}/birdiesBets`);
    const doublesBetsRef = ref(db, `rounds/${code}/doublesBets`);
    const payoutStatusRef = ref(db, `rounds/${code}/payoutStatus`);

    // hostId and createdAt never change after round creation, so a
    // one-time read is enough for both - no need for a live listener like
    // the ones below.
    void dbGet(ref(db, `rounds/${code}/hostId`)).then((snapshot) => {
      set({ hostId: snapshot.val() ?? null });
    });
    void dbGet(ref(db, `rounds/${code}/createdAt`)).then((snapshot) => {
      set({ createdAt: snapshot.val() ?? null });
    });

    // This player's own fairway/putts stats for the round so far - private
    // per-device data, so a one-time read (like hostId/createdAt above) is
    // enough to restore them if the app was restarted mid-round.
    void dbGet(ref(db, `players/${uid}/history/${code}/holeStats`)).then((snapshot) => {
      set({ myHoleStats: holeStatsFromSnapshotValue(snapshot.val()) });
    });

    // Nassau, Match Play, Skins, Stroke Play, and the final settlement all
    // derive from the same handful of inputs (scores, teams/playerTeams,
    // skinsBets/strokePlayBets, handicaps, the net-scoring flags, and the
    // dollar amounts) which sync through several independent listeners
    // below - simplest to recompute all of them together from the latest
    // state whenever any one of them fires, rather than tracking which
    // listener feeds which computed value.
    const recomputeAll = () => {
      const {
        groups,
        teams,
        playerTeams,
        nassauNet,
        nassauAmounts,
        nassauAutoPress,
        nassauPressStacking,
        nassauPressCalls,
        matchPlayTeams,
        matchPlayPlayerTeams,
        matchPlayNet,
        matchPlayAmounts,
        skinsBets,
        strokePlayBets,
        birdiesBets,
        doublesBets,
        handicaps,
        holes,
        totalHoles,
        courseName,
        createdAt,
      } = get();
      const allPlayers = groups.flatMap((group) => group.players);
      const grossScores = mergeGroupScores(groups);
      const netScores = toNetScores(grossScores, holes, handicaps, allPlayers, totalHoles);
      const playerGroupId = new Map<string, string>();
      for (const group of groups) {
        for (const player of group.players) {
          playerGroupId.set(player.id, group.id);
        }
      }
      const nassau = computeNassau(
        allPlayers,
        nassauNet ? netScores : grossScores,
        teams,
        playerTeams,
        totalHoles,
        playerGroupId
      );
      const nassauPressResults = computeNassauPressResults(
        nassau,
        nassauNet ? netScores : grossScores,
        totalHoles,
        nassauAutoPress,
        nassauPressStacking,
        nassauPressCalls
      );
      const matchPlay = computeNassau(
        allPlayers,
        matchPlayNet ? netScores : grossScores,
        matchPlayTeams,
        matchPlayPlayerTeams,
        totalHoles
      );
      const skins = computeSkins(allPlayers, grossScores, netScores, skinsBets, totalHoles);
      const strokePlay = computeStrokePlay(allPlayers, grossScores, netScores, holes, strokePlayBets, totalHoles);
      const birdies = computeBirdies(allPlayers, grossScores, netScores, holes, birdiesBets, totalHoles);
      const doubles = computeDoubles(allPlayers, grossScores, netScores, holes, doublesBets, totalHoles);
      const { settlement, betCards } = computeSettlement(
        allPlayers,
        nassau,
        nassauAmounts,
        nassauPressResults,
        matchPlay,
        matchPlayAmounts,
        skins,
        skinsBets,
        strokePlay,
        strokePlayBets,
        birdies,
        birdiesBets,
        doubles,
        doublesBets,
        totalHoles
      );
      set({ nassau, nassauPressResults, matchPlay, skins, strokePlay, birdies, doubles, settlement, betCards });

      // Once every bet is closed, record this device's own result to its
      // own private history - harmless to re-run on every recompute while
      // closed stays true, since a listener only fires when the underlying
      // data actually changes, not on a timer.
      if (allBetsClosed(nassau, matchPlay, skins, strokePlay, birdies, doubles, totalHoles, nassauPressResults)) {
        void recordHistoryEntry(code, uid, createdAt, courseName, totalHoles, allPlayers, settlement, betCards);
        void recordRegulars(uid, allPlayers, handicaps);
      }
    };

    detachHolesListener = onValue(holesRef, (snapshot) => {
      const holes: HolesInfo = snapshot.val() ?? {};
      set({ holes });
      recomputeAll();
    });

    detachCourseNameListener = onValue(courseNameRef, (snapshot) => {
      set({ courseName: snapshot.val() ?? null });
      recomputeAll();
    });

    // Missing status means this round predates the prep/active split -
    // treat it as already active rather than retroactively stranding an
    // in-progress round on a setup screen it never had.
    detachStatusListener = onValue(statusRef, (snapshot) => {
      const roundStatus: RoundStatus = snapshot.val() === 'prep' ? 'prep' : 'active';
      set({ roundStatus });
    });

    // Reads every group in the round, not just this device's own group -
    // needed so the Leaderboard tab can show every group's progress. Writes
    // stay scoped to myGroupId above and are enforced by the security
    // rules, so reading everyone's data here doesn't let this device edit it.
    detachGroupsListener = onValue(groupsRef, (snapshot) => {
      const groups = groupsFromSnapshotValue(snapshot.val());
      set({ groups });
      recomputeAll();
    });

    detachTeamsListener = onValue(teamsRef, (snapshot) => {
      set({ teams: teamsFromSnapshotValue(snapshot.val()) });
      recomputeAll();
    });

    detachPlayerTeamsListener = onValue(playerTeamsRef, (snapshot) => {
      set({ playerTeams: snapshot.val() ?? {} });
      recomputeAll();
    });

    detachSkinsBetsListener = onValue(skinsBetsRef, (snapshot) => {
      set({ skinsBets: skinsBetsFromSnapshotValue(snapshot.val()) });
      recomputeAll();
    });

    detachHandicapsListener = onValue(handicapsRef, (snapshot) => {
      set({ handicaps: snapshot.val() ?? {} });
      recomputeAll();
    });

    // Missing nassauNet means it was never set - default to gross, Nassau's
    // original (and only) behavior before net scoring existed.
    detachNassauNetListener = onValue(nassauNetRef, (snapshot) => {
      set({ nassauNet: snapshot.val() === true });
      recomputeAll();
    });

    // Missing nassauStakesUnit means it was never set - default to money.
    detachNassauStakesUnitListener = onValue(nassauStakesUnitRef, (snapshot) => {
      set({ nassauStakesUnit: snapshot.val() === 'drinks' ? 'drinks' : 'money' });
    });

    detachNassauAmountsListener = onValue(nassauAmountsRef, (snapshot) => {
      const value = snapshot.val() as Partial<NassauAmounts> | null;
      set({
        nassauAmounts: {
          front: value?.front ?? 0,
          back: value?.back ?? 0,
          overall: value?.overall ?? 0,
        },
      });
      recomputeAll();
    });

    detachNassauAutoPressListener = onValue(nassauAutoPressRef, (snapshot) => {
      set({ nassauAutoPress: snapshot.val() === true });
      recomputeAll();
    });

    // Missing nassauPressStacking means this round predates presses -
    // default to 'single', the more conservative of the three.
    detachNassauPressStackingListener = onValue(nassauPressStackingRef, (snapshot) => {
      const val = snapshot.val();
      set({ nassauPressStacking: val === 'unlimited' || val === 'none' ? val : 'single' });
      recomputeAll();
    });

    detachNassauPressCallsListener = onValue(nassauPressCallsRef, (snapshot) => {
      set({ nassauPressCalls: nassauPressCallsFromSnapshotValue(snapshot.val()) });
      recomputeAll();
    });

    // Missing totalHoles means nobody has set it yet (a brand-new round, or
    // one that predates this setting) - default to 9, the more common
    // casual-round length, rather than assuming a full 18. Clamp
    // currentHole down too, so switching a round to 9 holes never leaves a
    // device stuck looking at a hole that no longer exists.
    detachTotalHolesListener = onValue(totalHolesRef, (snapshot) => {
      const totalHoles = snapshot.val() === 18 ? 18 : 9;
      set((state) => ({
        totalHoles,
        currentHole: Math.min(state.currentHole, totalHoles),
      }));
      recomputeAll();
    });

    detachMatchPlayTeamsListener = onValue(matchPlayTeamsRef, (snapshot) => {
      set({ matchPlayTeams: teamsFromSnapshotValue(snapshot.val()) });
      recomputeAll();
    });

    detachMatchPlayPlayerTeamsListener = onValue(matchPlayPlayerTeamsRef, (snapshot) => {
      set({ matchPlayPlayerTeams: snapshot.val() ?? {} });
      recomputeAll();
    });

    // Missing matchPlayNet means it was never set - default to gross, same
    // as Nassau's own default.
    detachMatchPlayNetListener = onValue(matchPlayNetRef, (snapshot) => {
      set({ matchPlayNet: snapshot.val() === true });
      recomputeAll();
    });

    // Missing matchPlayStakesUnit means it was never set - default to money.
    detachMatchPlayStakesUnitListener = onValue(matchPlayStakesUnitRef, (snapshot) => {
      set({ matchPlayStakesUnit: snapshot.val() === 'drinks' ? 'drinks' : 'money' });
    });

    detachMatchPlayAmountsListener = onValue(matchPlayAmountsRef, (snapshot) => {
      const value = snapshot.val() as Partial<NassauAmounts> | null;
      set({
        matchPlayAmounts: {
          front: value?.front ?? 0,
          back: value?.back ?? 0,
          overall: value?.overall ?? 0,
        },
      });
      recomputeAll();
    });

    detachStrokePlayBetsListener = onValue(strokePlayBetsRef, (snapshot) => {
      set({ strokePlayBets: strokePlayBetsFromSnapshotValue(snapshot.val()) });
      recomputeAll();
    });

    detachBirdiesBetsListener = onValue(birdiesBetsRef, (snapshot) => {
      set({ birdiesBets: birdiesBetsFromSnapshotValue(snapshot.val()) });
      recomputeAll();
    });

    detachDoublesBetsListener = onValue(doublesBetsRef, (snapshot) => {
      set({ doublesBets: doublesBetsFromSnapshotValue(snapshot.val()) });
      recomputeAll();
    });

    // Not part of recomputeAll's dependency chain - a sent/confirmed
    // toggle never changes the bets or amounts owed, only whether they've
    // actually been paid, so this just mirrors the raw node into state.
    detachPayoutStatusListener = onValue(payoutStatusRef, (snapshot) => {
      const value = (snapshot.val() ?? {}) as Record<
        string,
        Partial<PayoutStatusEntry> | undefined
      >;
      const payoutStatus: Record<string, PayoutStatusEntry> = {};
      for (const [txId, entry] of Object.entries(value)) {
        payoutStatus[txId] = {
          sentByPayer: entry?.sentByPayer === true,
          sentAt: entry?.sentAt ?? null,
          confirmedByPayee: entry?.confirmedByPayee === true,
          confirmedAt: entry?.confirmedAt ?? null,
        };
      }
      set({ payoutStatus });
    });

    set({
      roundCode: code,
      myGroupId: groupId,
      playerId: uid,
      status: 'connected',
      errorMessage: null,
      scoringGroupId: null,
      previewRoundCode: null,
      previewGroups: [],
    });
  },
}));
