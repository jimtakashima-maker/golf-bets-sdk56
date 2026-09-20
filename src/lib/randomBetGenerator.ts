import type { Group, Player, NassauAmounts, SkinsPayoutMode, StrokePlayPayoutMode } from '../state/useRoundState';

// ---------- Plan types ----------
//
// generateRandomBets() is a pure function - given the round's players,
// groups, and length, plus a per-player dollar cap, it returns a plan to
// create (never mutates anything itself). RoundPrepScreen is what actually
// walks the plan and calls the store's setters - keeping the randomness
// and the money math here, separate from the async Firebase calls, makes
// both easier to reason about on their own.
//
// The cap this promises is on the bets it creates, not on everything that
// could ever happen in the round: a Nassau press is a separate, opt-in bet
// called live during play (see NassauSettings/NassauPressPanel), and this
// generator always turns "auto-press at 2 down" off so nothing gets added
// to a player's exposure without them choosing it. That's why "perStroke"
// Stroke Play is never generated either - its payout scales with how
// badly someone loses, with no upper bound, unlike every other payout
// mode here, which is a flat, known amount win or lose.

export interface RandomTeamPair {
  // Which tee group this pair belongs to (Nassau matchups never cross tee
  // groups) - null for a Match Play pair, which pools every round player
  // regardless of tee group.
  groupId: string | null;
  teamAName: string;
  teamAPlayerIds: string[];
  teamBName: string;
  teamBPlayerIds: string[];
}

export interface RandomTeamPlan {
  kind: 'nassau' | 'matchPlay';
  amounts: NassauAmounts;
  pairs: RandomTeamPair[];
}

export interface RandomSkinsPlan {
  payoutMode: SkinsPayoutMode;
  valuePerSkin: number;
  buyIn: number;
  playerIds: string[];
}

export interface RandomStrokePlayPlan {
  payoutMode: StrokePlayPayoutMode;
  buyIn: number;
  playerIds: string[];
}

export interface RandomBetPlan {
  team: RandomTeamPlan | null;
  skins: RandomSkinsPlan | null;
  strokePlay: RandomStrokePlayPlan | null;
  maxPerPlayer: number;
  // One line per generated bet, written to read naturally in a
  // confirmation alert rather than as raw data.
  summary: string[];
}

// ---------- Small helpers ----------

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Splits a shuffled list into two teams as evenly as possible. An odd
// count gives the extra player to one side rather than sitting anyone out
// - a normal, if slightly uneven, way to play a best-ball Nassau.
function splitIntoTwoTeams(playerIds: string[]): [string[], string[]] {
  const ids = shuffled(playerIds);
  const half = Math.ceil(ids.length / 2);
  return [ids.slice(0, half), ids.slice(half)];
}

function nameFor(playerId: string, players: Player[]): string {
  return players.find((p) => p.id === playerId)?.name ?? 'Team';
}

// Random positive weights summing to 1, so a cap split across several bet
// categories comes out a little different each time instead of always
// dividing evenly.
function randomWeights(count: number): number[] {
  const raw = Array.from({ length: count }, () => 0.3 + Math.random());
  const total = raw.reduce((sum, n) => sum + n, 0);
  return raw.map((n) => n / total);
}

// ---------- Main entry point ----------

export function generateRandomBets(
  players: Player[],
  groups: Group[],
  totalHoles: number,
  maxPerPlayer: number
): RandomBetPlan {
  const empty = (summary: string[]): RandomBetPlan => ({
    team: null,
    skins: null,
    strokePlay: null,
    maxPerPlayer,
    summary,
  });

  const totalPlayers = players.length;
  if (totalPlayers < 2) {
    return empty(['Need at least 2 players in the round to generate any bets.']);
  }

  const eligibleGroups = groups.filter((g) => g.players.length >= 2);

  // 1. Decide which categories to include this time. Nassau is preferred
  // (it's the app's richest format) whenever at least one tee group has
  // enough players to pair up; Match Play, which isn't scoped to a tee
  // group, is the fallback when it doesn't.
  const teamKind: 'nassau' | 'matchPlay' | null =
    eligibleGroups.length > 0 ? (Math.random() < 0.75 ? 'nassau' : 'matchPlay') : 'matchPlay';

  let includeTeam = Math.random() < 0.85;
  let includeSkins = Math.random() < 0.7;
  let includeStrokePlay = Math.random() < 0.6;

  // Never generate an empty round - if every coin flip came up "skip",
  // fall back to the team bet, which is always possible with 2+ players.
  if (!includeTeam && !includeSkins && !includeStrokePlay) {
    includeTeam = true;
  }

  const categories: Array<'team' | 'skins' | 'strokePlay'> = [];
  if (includeTeam) categories.push('team');
  if (includeSkins) categories.push('skins');
  if (includeStrokePlay) categories.push('strokePlay');

  // 2. Split the per-player cap across the chosen categories. If the cap
  // is too small to give every chosen category at least $1, collapse down
  // to just one category (picked at random from what was chosen) instead
  // of generating several token, near-worthless bets.
  const flooredCap = Math.floor(maxPerPlayer);
  const effectiveCategories =
    flooredCap >= categories.length ? categories : [categories[Math.floor(Math.random() * categories.length)]];

  const weights = randomWeights(effectiveCategories.length);
  const budgets = new Map<string, number>();
  effectiveCategories.forEach((category, i) => {
    const share = effectiveCategories.length === 1 ? flooredCap : Math.floor(flooredCap * weights[i]);
    budgets.set(category, share);
  });

  const summary: string[] = [];
  let team: RandomTeamPlan | null = null;
  let skins: RandomSkinsPlan | null = null;
  let strokePlay: RandomStrokePlayPlan | null = null;

  // 3. Team bet (Nassau or Match Play) - a flat amount per segment, so the
  // worst case for anyone on a team is exactly front + back + overall,
  // whatever the team size, since each player is on exactly one team here.
  const teamBudget = budgets.get('team') ?? 0;
  if (effectiveCategories.includes('team') && teamBudget > 0) {
    const amounts: NassauAmounts =
      totalHoles === 9
        ? { front: teamBudget, back: 0, overall: 0 }
        : (() => {
            const third = Math.floor(teamBudget / 3);
            return { front: teamBudget - third * 2, back: third, overall: third };
          })();

    const pairs: RandomTeamPair[] = [];
    if (teamKind === 'nassau') {
      for (const group of eligibleGroups) {
        const [a, b] = splitIntoTwoTeams(group.players.map((p) => p.id));
        pairs.push({
          groupId: group.id,
          teamAName: nameFor(a[0], players),
          teamAPlayerIds: a,
          teamBName: nameFor(b[0], players),
          teamBPlayerIds: b,
        });
      }
    } else {
      const [a, b] = splitIntoTwoTeams(players.map((p) => p.id));
      pairs.push({
        groupId: null,
        teamAName: nameFor(a[0], players),
        teamAPlayerIds: a,
        teamBName: nameFor(b[0], players),
        teamBPlayerIds: b,
      });
    }

    if (pairs.length > 0) {
      team = { kind: teamKind, amounts, pairs };
      const label = teamKind === 'nassau' ? 'Nassau' : 'Match Play';
      const amountLabel =
        totalHoles === 9 ? `$${amounts.front}` : `$${amounts.front}-$${amounts.back}-$${amounts.overall}`;
      summary.push(`${label}: ${amountLabel}, net - ${pairs.length} matchup${pairs.length === 1 ? '' : 's'}`);
    }
  }

  // 4. Skins - "pot" is the safe fallback whenever "perSkin" would need
  // less than $1/hole to stay within budget, since a pot's worst case is
  // always exactly its buy-in no matter how many holes are played.
  const skinsBudget = budgets.get('skins') ?? 0;
  if (effectiveCategories.includes('skins') && skinsBudget > 0) {
    let payoutMode: SkinsPayoutMode = Math.random() < 0.5 ? 'perSkin' : 'pot';
    let valuePerSkin = 0;
    if (payoutMode === 'perSkin') {
      valuePerSkin = Math.floor(skinsBudget / totalHoles);
      if (valuePerSkin < 1) payoutMode = 'pot';
    }
    const buyIn = payoutMode === 'pot' ? skinsBudget : 0;
    skins = { payoutMode, valuePerSkin, buyIn, playerIds: players.map((p) => p.id) };
    summary.push(payoutMode === 'perSkin' ? `Skins: $${valuePerSkin}/skin, net` : `Skins: $${buyIn} buy-in pot, net`);
  }

  // 5. Stroke Play - pot-style payouts only (see the module note above on
  // why "perStroke" is never generated here).
  const strokePlayBudget = budgets.get('strokePlay') ?? 0;
  if (effectiveCategories.includes('strokePlay') && strokePlayBudget > 0) {
    const payoutMode: StrokePlayPayoutMode = Math.random() < 0.5 ? 'potWinner' : 'potFinish';
    strokePlay = { payoutMode, buyIn: strokePlayBudget, playerIds: players.map((p) => p.id) };
    summary.push(
      `Stroke Play: $${strokePlayBudget} buy-in pot, net (${payoutMode === 'potWinner' ? 'winner take all' : 'paid by finish'})`
    );
  }

  if (summary.length === 0) {
    summary.push(`$${maxPerPlayer}/player isn't enough to fund a bet here - try a higher amount.`);
  }

  return { team, skins, strokePlay, maxPerPlayer, summary };
}
