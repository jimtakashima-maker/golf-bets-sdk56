import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from 'react-native';
import {
  useRoundState,
  NassauState,
  SkinsState,
  StrokePlayState,
  NassauPressResult,
  Settlement,
  SettlementLineItem,
  BetCard,
  isNassauMatchupResolved,
  isNassauSegmentResolved,
  allBetsClosed,
} from '../state/useRoundState';

function formatAmount(amount: number): string {
  const rounded = Math.abs(Math.round(amount * 100) / 100);
  return `$${rounded.toFixed(2)}`;
}

function formatSigned(amount: number): string {
  if (amount === 0) return formatAmount(0);
  return amount > 0 ? `+${formatAmount(amount)}` : `-${formatAmount(amount)}`;
}

// Names every matchup/bet that's still holding the round open, so "Matches
// In Progress" isn't a dead end - useful both for players wondering what's
// left and for tracking down a bet that looks done but isn't.
function openItems(
  nassau: NassauState,
  matchPlay: NassauState,
  skins: SkinsState,
  strokePlay: StrokePlayState,
  totalHoles: number,
  nassauPressResults: NassauPressResult[]
): string[] {
  const items: string[] = [];
  for (const matchup of nassau) {
    if (!isNassauMatchupResolved(matchup, totalHoles)) {
      items.push(`Nassau: ${matchup.labelA} vs ${matchup.labelB}`);
    }
  }
  for (const press of nassauPressResults) {
    const required = press.endHole - press.startHole + 1;
    if (!isNassauSegmentResolved(press.state, required)) {
      items.push(`Nassau: ${press.segmentName} press (from hole ${press.startHole})`);
    }
  }
  for (const matchup of matchPlay) {
    if (!isNassauMatchupResolved(matchup, totalHoles)) {
      items.push(`Match Play: ${matchup.labelA} vs ${matchup.labelB}`);
    }
  }
  for (const bet of skins) {
    if (bet.totals.length > 0 && bet.holesResolved < totalHoles) {
      items.push(`Skins: ${bet.name}`);
    }
  }
  for (const bet of strokePlay) {
    if (bet.totals.length > 0 && !bet.resolved) {
      // Name whoever's short, not just the bet - `resolved` is blocked by
      // a single entrant's incomplete scorecard, so pointing at the bet
      // alone leaves the actual cause to guess at.
      const waitingOn = bet.totals
        .filter((total) => total.holesPlayed < totalHoles)
        .map((total) => `${total.label} (${total.holesPlayed}/${totalHoles})`);
      const suffix = waitingOn.length > 0 ? ` (waiting on ${waitingOn.join(', ')})` : '';
      items.push(`Stroke Play: ${bet.name}${suffix}`);
    }
  }
  return items;
}

interface PayoutTransaction {
  fromId: string;
  fromLabel: string;
  toId: string;
  toLabel: string;
  amount: number;
}

// The fewest payments that settle every player's net total - the standard
// "simplify debts" approach (repeatedly pay the biggest creditor from the
// biggest debtor) rather than everyone paying back whichever bets they
// personally lost, which usually means way more, smaller transactions
// than actually necessary once wins and losses across different bets
// cancel out for the same two players.
function computePayoutPlan(settlement: Settlement): PayoutTransaction[] {
  // Work in integer cents so floating point drift can't strand a penny or
  // leave a near-zero transaction on the plan.
  const balances = settlement
    .map((entry) => ({ id: entry.id, label: entry.label, cents: Math.round(entry.amount * 100) }))
    .filter((entry) => entry.cents !== 0);

  const creditors = balances.filter((b) => b.cents > 0).sort((a, b) => b.cents - a.cents);
  const debtors = balances.filter((b) => b.cents < 0).sort((a, b) => a.cents - b.cents);

  const plan: PayoutTransaction[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.cents, -debtor.cents);
    plan.push({
      fromId: debtor.id,
      fromLabel: debtor.label,
      toId: creditor.id,
      toLabel: creditor.label,
      amount: amount / 100,
    });
    creditor.cents -= amount;
    debtor.cents += amount;
    if (creditor.cents === 0) ci += 1;
    if (debtor.cents === 0) di += 1;
  }
  return plan;
}

// Read-only breakdown of exactly which bets added up to one player's
// settlement total - one row per line item from computeSettlement, split
// into a Won column and a Lost column rather than a single signed number,
// so it reads like a simple ledger.
function PlayerBreakdownModal({
  visible,
  playerName,
  breakdown,
  totalAmount,
  onClose,
}: {
  visible: boolean;
  playerName: string;
  breakdown: SettlementLineItem[];
  totalAmount: number;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={detailStyles.backdrop} onPress={onClose} />
      <View style={detailStyles.sheet}>
        <Text style={detailStyles.title}>{playerName}</Text>
        <Text style={detailStyles.subtitle}>How this total was reached</Text>

        {breakdown.length === 0 ? (
          <Text style={detailStyles.empty}>Nothing settled yet.</Text>
        ) : (
          <>
            <View style={detailStyles.headerRow}>
              <Text style={[detailStyles.headerText, detailStyles.betCol]}>BET</Text>
              <Text style={[detailStyles.headerText, detailStyles.amountCol]}>WON</Text>
              <Text style={[detailStyles.headerText, detailStyles.amountCol]}>LOST</Text>
            </View>
            <ScrollView style={detailStyles.rows}>
              {breakdown.map((item, index) => (
                <View key={`${item.label}-${index}`} style={detailStyles.row}>
                  <Text style={detailStyles.betText} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <Text style={[detailStyles.amountCol, detailStyles.wonText]}>
                    {item.amount > 0 ? formatAmount(item.amount) : ''}
                  </Text>
                  <Text style={[detailStyles.amountCol, detailStyles.lostText]}>
                    {item.amount < 0 ? formatAmount(item.amount) : ''}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        <View style={detailStyles.totalRow}>
          <Text style={detailStyles.totalLabel}>Total</Text>
          <Text
            style={[
              detailStyles.totalAmount,
              totalAmount > 0 ? detailStyles.wonText : totalAmount < 0 ? detailStyles.lostText : null,
            ]}
          >
            {formatSigned(totalAmount)}
          </Text>
        </View>

        <Pressable style={detailStyles.closeButton} onPress={onClose}>
          <Text style={detailStyles.closeButtonText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// One settled bet (or Nassau/Match Play segment), every player's result for
// it in one card - same shape whether it's shown on the Bets tab or the
// Pots tab, just a different subset of cards feeding it.
function BetCardView({ card }: { card: BetCard }) {
  return (
    <View style={styles.potBlock}>
      <View style={styles.potTitleRow}>
        <Text style={styles.potTitle}>{card.title}</Text>
        <Text style={styles.potMode}>{card.category}</Text>
      </View>
      {card.rows.map((row, index) => (
        <View key={`${row.playerId}-${index}`} style={styles.potRow}>
          <Text style={styles.potRowName}>{row.label}</Text>
          <Text
            style={[
              styles.potRowAmount,
              row.amount > 0 ? styles.owedText : row.amount < 0 ? styles.owesText : styles.evenAmountText,
            ]}
          >
            {formatSigned(row.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

type SettlementTab = 'players' | 'bets' | 'pots' | 'payout';

const TABS: Array<{ key: SettlementTab; label: string }> = [
  { key: 'players', label: 'Players' },
  { key: 'bets', label: 'Bets' },
  { key: 'pots', label: 'Pots' },
  { key: 'payout', label: 'Payout Plan' },
];

export default function SettlementScreen() {
  const groups = useRoundState((state) => state.groups);
  const settlement = useRoundState((state) => state.settlement);
  const betCards = useRoundState((state) => state.betCards);
  const nassau = useRoundState((state) => state.nassau);
  const nassauPressResults = useRoundState((state) => state.nassauPressResults);
  const matchPlay = useRoundState((state) => state.matchPlay);
  const skins = useRoundState((state) => state.skins);
  const strokePlay = useRoundState((state) => state.strokePlay);
  const totalHoles = useRoundState((state) => state.totalHoles);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettlementTab>('players');

  // Everyone in the round, even a player with nothing settled yet - shown
  // as "not settled yet" rather than just missing from the list.
  const allPlayers = groups.flatMap((group) => group.players);
  const settlementById = new Map(settlement.map((entry) => [entry.id, entry]));
  const closed = allBetsClosed(nassau, matchPlay, skins, strokePlay, totalHoles, nassauPressResults);
  const open = closed ? [] : openItems(nassau, matchPlay, skins, strokePlay, totalHoles, nassauPressResults);
  const potCards = betCards.filter((card) => card.isPot);
  // Only worth recommending once every bet is actually final - a plan
  // built on totals that are still moving would just have to be redone.
  const payoutPlan = closed ? computePayoutPlan(settlement) : [];
  const selectedPlayer = allPlayers.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedEntry = selectedPlayerId ? settlementById.get(selectedPlayerId) : undefined;

  return (
    <>
      <View style={styles.header}>
        <View
          style={[
            styles.statusBanner,
            closed ? styles.statusBannerClosed : styles.statusBannerInProgress,
          ]}
        >
          <Text style={[styles.statusBannerText, closed ? styles.statusTextClosed : styles.statusTextInProgress]}>
            {closed ? 'All Bets Closed' : 'Matches In Progress'}
          </Text>
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              style={[styles.tabButton, activeTab === tab.key && styles.tabButtonActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabButtonText, activeTab === tab.key && styles.tabButtonTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {activeTab === 'players' &&
          (allPlayers.length === 0 ? (
            <Text style={styles.empty}>No players yet.</Text>
          ) : (
            allPlayers.map((player) => {
              const entry = settlementById.get(player.id);
              const amount = entry?.amount ?? 0;
              // A player with real settled line items that happen to net to
              // zero (won some, lost some, came out even) is not the same as
              // a player nothing has settled for yet - the first is "All
              // square", the second is "Nothing settled yet".
              const hasActivity = !!entry && entry.breakdown.length > 0;
              return (
                <Pressable key={player.id} style={styles.row} onPress={() => setSelectedPlayerId(player.id)}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  {!hasActivity ? (
                    <Text style={styles.evenText}>Nothing settled yet</Text>
                  ) : amount === 0 ? (
                    <Text style={styles.evenText}>All square</Text>
                  ) : (
                    <Text style={[styles.amountText, amount > 0 ? styles.owedText : styles.owesText]}>
                      {formatSigned(amount)}
                    </Text>
                  )}
                </Pressable>
              );
            })
          ))}

        {activeTab === 'bets' &&
          (betCards.length === 0 ? (
            <Text style={styles.empty}>No bets settled yet.</Text>
          ) : (
            betCards.map((card) => <BetCardView key={card.key} card={card} />)
          ))}

        {activeTab === 'pots' &&
          (potCards.length === 0 ? (
            <Text style={styles.empty}>No pot bets settled yet.</Text>
          ) : (
            potCards.map((card) => <BetCardView key={card.key} card={card} />)
          ))}

        {activeTab === 'payout' &&
          (!closed ? (
            <Text style={styles.empty}>Payout plan is available once all bets are closed.</Text>
          ) : payoutPlan.length === 0 ? (
            <Text style={styles.empty}>Everyone's square - nobody owes anything.</Text>
          ) : (
            <>
              <Text style={styles.payoutCount}>
                {payoutPlan.length} {payoutPlan.length === 1 ? 'payment' : 'payments'} settles everything
              </Text>
              {payoutPlan.map((tx, index) => (
                <View key={`${tx.fromId}-${tx.toId}-${index}`} style={styles.payoutRow}>
                  <Text style={styles.payoutNames} numberOfLines={1}>
                    {tx.fromLabel} <Text style={styles.payoutArrow}>{'\u2192'}</Text> {tx.toLabel}
                  </Text>
                  <Text style={styles.payoutAmount}>{formatAmount(tx.amount)}</Text>
                </View>
              ))}
            </>
          ))}

        {open.length > 0 && (
          <View style={styles.openSection}>
            <Text style={styles.openSectionTitle}>Still Open</Text>
            {open.map((item, index) => (
              <Text key={index} style={styles.openItemText}>
                {'•'} {item}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      <PlayerBreakdownModal
        visible={selectedPlayer !== null}
        playerName={selectedPlayer?.name ?? ''}
        breakdown={selectedEntry?.breakdown ?? []}
        totalAmount={selectedEntry?.amount ?? 0}
        onClose={() => setSelectedPlayerId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  statusBanner: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  statusBannerClosed: {
    backgroundColor: '#e6f4ea',
  },
  statusBannerInProgress: {
    backgroundColor: '#fdf1de',
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statusTextClosed: {
    color: '#1a7f37',
  },
  statusTextInProgress: {
    color: '#b5730a',
  },
  openSection: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  openSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#889',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  openItemText: {
    fontSize: 12,
    color: '#889',
    marginTop: 2,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabButton: {
    paddingVertical: 10,
    marginRight: 22,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#1a7f37',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#889',
  },
  tabButtonTextActive: {
    color: '#234',
  },
  empty: {
    color: '#889',
    paddingTop: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#234',
  },
  evenText: {
    color: '#889',
    fontSize: 13,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '700',
  },
  owedText: {
    color: '#1a7f37',
  },
  owesText: {
    color: '#c0392b',
  },
  evenAmountText: {
    color: '#889',
  },
  potBlock: {
    marginTop: 16,
    backgroundColor: '#f7f8fa',
    borderRadius: 8,
    padding: 12,
  },
  potTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  potTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#234',
  },
  potMode: {
    fontSize: 11,
    color: '#889',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  potRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  potRowName: {
    fontSize: 14,
    color: '#345',
  },
  potRowAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  payoutCount: {
    fontSize: 13,
    color: '#889',
    marginTop: 16,
    marginBottom: 4,
  },
  payoutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  payoutNames: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#234',
    paddingRight: 10,
  },
  payoutArrow: {
    color: '#889',
    fontWeight: '400',
  },
  payoutAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#234',
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
    marginBottom: 12,
  },
  empty: {
    color: '#889',
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 6,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#889',
    letterSpacing: 0.5,
  },
  betCol: {
    flex: 1,
  },
  amountCol: {
    width: 72,
    textAlign: 'right',
  },
  rows: {
    maxHeight: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f3f3',
  },
  betText: {
    flex: 1,
    fontSize: 13,
    color: '#234',
    paddingRight: 6,
  },
  wonText: {
    color: '#1a7f37',
    fontWeight: '600',
    fontSize: 13,
  },
  lostText: {
    color: '#c0392b',
    fontWeight: '600',
    fontSize: 13,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#234',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#1a7f37',
    fontWeight: '600',
  },
});
