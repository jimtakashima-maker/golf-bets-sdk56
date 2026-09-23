import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Linking } from 'react-native';
import {
  useRoundState,
  NassauState,
  SkinsState,
  StrokePlayState,
  BirdiesState,
  DoublesState,
  NassauPressResult,
  Settlement,
  SettlementLineItem,
  BetCard,
  PaymentHandles,
  isNassauMatchupResolved,
  isNassauSegmentResolved,
  allBetsClosed,
} from '../state/useRoundState';
import { auth } from '../lib/firebase';

export function formatAmount(amount: number): string {
  const rounded = Math.abs(Math.round(amount * 100) / 100);
  return `$${rounded.toFixed(2)}`;
}

export function formatSigned(amount: number): string {
  if (amount === 0) return formatAmount(0);
  return amount > 0 ? `+${formatAmount(amount)}` : `-${formatAmount(amount)}`;
}

// "Sep 20, 4:32 PM" - used only for the locked, timestamped payout status
// in History (see PayoutStatusRow's locked/sentAt/confirmedAt props); the
// live round has no need for it since its toggles stay freely reversible.
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Names every matchup/bet that's still holding the round open, so "Matches
// In Progress" isn't a dead end - useful both for players wondering what's
// left and for tracking down a bet that looks done but isn't.
function openItems(
  nassau: NassauState,
  matchPlay: NassauState,
  skins: SkinsState,
  strokePlay: StrokePlayState,
  birdies: BirdiesState,
  doubles: DoublesState,
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
  for (const bet of birdies) {
    if (bet.totals.length > 0 && bet.holesResolved < totalHoles) {
      items.push(`Birdies: ${bet.name}`);
    }
  }
  for (const bet of doubles) {
    if (bet.totals.length > 0 && bet.holesResolved < totalHoles) {
      items.push(`Doubles: ${bet.name}`);
    }
  }
  return items;
}

export interface PayoutTransaction {
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
export function computePayoutPlan(settlement: Settlement): PayoutTransaction[] {
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

// Venmo has no reliable web-only fallback for prefilling an amount, so this
// tries the app's own URL scheme first and only falls back to the plain
// profile page (no prefill) if that throws. Deliberately skips a
// canOpenURL check first - on Android 11+, canOpenURL only reports true for
// a scheme this app declared in its manifest's <queries> block, which venmo
// isn't (and adding it means a native rebuild), while actually opening the
// URL via an explicit user tap works regardless. PayPal and Cash App both
// support a direct HTTPS link that prefills the amount either way, app
// installed or not, so those don't need any of this.
async function openVenmo(handle: string, amount: number, note: string) {
  const clean = handle.trim().replace(/^@/, '');
  if (!clean) return;
  const appUrl = `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(clean)}&amount=${amount.toFixed(
    2
  )}&note=${encodeURIComponent(note)}`;
  const webUrl = `https://venmo.com/${encodeURIComponent(clean)}`;
  try {
    await Linking.openURL(appUrl);
  } catch {
    await Linking.openURL(webUrl).catch(() => undefined);
  }
}

function openPaypal(handle: string, amount: number) {
  const clean = handle.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?paypal\.me\//i, '');
  if (!clean) return;
  void Linking.openURL(`https://paypal.me/${encodeURIComponent(clean)}/${amount.toFixed(2)}`).catch(
    () => undefined
  );
}

function openCashApp(handle: string, amount: number) {
  const clean = handle.trim().replace(/^\$/, '');
  if (!clean) return;
  void Linking.openURL(`https://cash.app/$${encodeURIComponent(clean)}/${amount.toFixed(2)}`).catch(
    () => undefined
  );
}

// The buttons/info a payer sees for settling one payout-plan transaction,
// built entirely from the recipient's own saved handles - the payer needs
// nothing saved themselves for a deep link to work, only the app installed.
// Zelle and a custom "Other" method have no reliable link format, so those
// render as plain text for the payer to copy by hand instead of a button.
export function PaymentOptions({ handles, amount, note }: { handles?: PaymentHandles; amount: number; note: string }) {
  if (!handles) return null;
  const buttons: { key: string; label: string; onPress: () => void }[] = [];
  if (handles.venmo) {
    buttons.push({ key: 'venmo', label: 'Venmo', onPress: () => void openVenmo(handles.venmo as string, amount, note) });
  }
  if (handles.paypal) {
    buttons.push({ key: 'paypal', label: 'PayPal', onPress: () => openPaypal(handles.paypal as string, amount) });
  }
  if (handles.cashapp) {
    buttons.push({ key: 'cashapp', label: 'Cash App', onPress: () => openCashApp(handles.cashapp as string, amount) });
  }
  const infoLines: string[] = [];
  if (handles.zelle) infoLines.push(`Zelle: ${handles.zelle}`);
  if (handles.otherLabel && handles.otherValue) infoLines.push(`${handles.otherLabel}: ${handles.otherValue}`);

  if (buttons.length === 0 && infoLines.length === 0) return null;

  return (
    <View style={styles.paymentOptions}>
      {buttons.length > 0 && (
        <View style={styles.paymentButtonsRow}>
          {buttons.map((button) => (
            <Pressable key={button.key} style={styles.paymentButton} onPress={button.onPress}>
              <Text style={styles.paymentButtonText}>Pay via {button.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {infoLines.map((line) => (
        <Text key={line} style={styles.paymentInfoText}>
          {line}
        </Text>
      ))}
    </View>
  );
}

// Sent/Confirmed toggles for one payout-plan transaction. Each side can
// only ever move their own flag (database.rules.json enforces this, and
// the store's markPayoutSent/markPayoutConfirmed no-op for the wrong uid
// too) - everyone else in the round just sees the current state read-only,
// which is what makes the two independent checks meaningful: money isn't
// "settled" until both the person who paid and the person who got paid
// say so.
//
// `locked` is History-only (the live round always leaves both sides freely
// reversible, in case of a mis-tap mid-round): once true, a flag that's
// already on can never be toggled back off, and a small info button
// appears next to it - tap to reveal exactly when it was set, from
// sentAt/confirmedAt, in a little info bubble under the row.
export function PayoutStatusRow({
  isPayer,
  isPayee,
  sentByPayer,
  confirmedByPayee,
  onToggleSent,
  onToggleConfirmed,
  locked,
  sentAt,
  confirmedAt,
}: {
  isPayer: boolean;
  isPayee: boolean;
  sentByPayer: boolean;
  confirmedByPayee: boolean;
  onToggleSent: () => void;
  onToggleConfirmed: () => void;
  locked?: boolean;
  sentAt?: number | null;
  confirmedAt?: number | null;
}) {
  const [sentInfoOpen, setSentInfoOpen] = useState(false);
  const [confirmedInfoOpen, setConfirmedInfoOpen] = useState(false);
  const sentLocked = !!locked && sentByPayer;
  const confirmedLocked = !!locked && confirmedByPayee;

  return (
    <View style={styles.payoutStatusWrap}>
      <View style={styles.payoutStatusRow}>
        <View style={styles.statusChipGroup}>
          <Pressable
            style={[styles.statusChip, sentByPayer && styles.statusChipDone]}
            onPress={isPayer && !sentLocked ? onToggleSent : undefined}
            disabled={!isPayer || sentLocked}
          >
            <Text style={[styles.statusChipText, sentByPayer && styles.statusChipTextDone]}>
              {sentByPayer ? 'Sent \u2713' : isPayer ? 'Mark Sent' : 'Not Sent'}
            </Text>
          </Pressable>
          {sentLocked && sentAt != null && (
            <Pressable
              style={styles.infoButton}
              onPress={() => setSentInfoOpen((open) => !open)}
              hitSlop={8}
            >
              <Text style={styles.infoButtonText}>i</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.statusChipGroup}>
          <Pressable
            style={[styles.statusChip, confirmedByPayee && styles.statusChipDone]}
            onPress={isPayee && !confirmedLocked ? onToggleConfirmed : undefined}
            disabled={!isPayee || confirmedLocked}
          >
            <Text style={[styles.statusChipText, confirmedByPayee && styles.statusChipTextDone]}>
              {confirmedByPayee ? 'Confirmed \u2713' : isPayee ? 'Confirm Received' : 'Not Confirmed'}
            </Text>
          </Pressable>
          {confirmedLocked && confirmedAt != null && (
            <Pressable
              style={styles.infoButton}
              onPress={() => setConfirmedInfoOpen((open) => !open)}
              hitSlop={8}
            >
              <Text style={styles.infoButtonText}>i</Text>
            </Pressable>
          )}
        </View>
      </View>
      {sentInfoOpen && sentAt != null && (
        <View style={styles.infoBubble}>
          <Text style={styles.infoBubbleText}>Marked sent {formatDateTime(sentAt)}</Text>
        </View>
      )}
      {confirmedInfoOpen && confirmedAt != null && (
        <View style={styles.infoBubble}>
          <Text style={styles.infoBubbleText}>Confirmed received {formatDateTime(confirmedAt)}</Text>
        </View>
      )}
    </View>
  );
}


// Read-only breakdown of exactly which bets added up to one player's
// settlement total - one row per line item from computeSettlement, split
// into a Won column and a Lost column rather than a single signed number,
// so it reads like a simple ledger.
export function PlayerBreakdownModal({
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
export function BetCardView({ card }: { card: BetCard }) {
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
  const birdies = useRoundState((state) => state.birdies);
  const doubles = useRoundState((state) => state.doubles);
  const totalHoles = useRoundState((state) => state.totalHoles);
  const roundCode = useRoundState((state) => state.roundCode);
  const paymentHandlesByUid = useRoundState((state) => state.paymentHandlesByUid);
  const loadPaymentHandlesForPlayers = useRoundState((state) => state.loadPaymentHandlesForPlayers);
  const payoutStatus = useRoundState((state) => state.payoutStatus);
  const markPayoutSent = useRoundState((state) => state.markPayoutSent);
  const markPayoutConfirmed = useRoundState((state) => state.markPayoutConfirmed);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettlementTab>('players');
  const myUid = auth.currentUser?.uid ?? null;

  // Everyone in the round, even a player with nothing settled yet - shown
  // as "not settled yet" rather than just missing from the list.
  const allPlayers = groups.flatMap((group) => group.players);
  const settlementById = new Map(settlement.map((entry) => [entry.id, entry]));
  const closed = allBetsClosed(nassau, matchPlay, skins, strokePlay, birdies, doubles, totalHoles, nassauPressResults);
  const open = closed
    ? []
    : openItems(nassau, matchPlay, skins, strokePlay, birdies, doubles, totalHoles, nassauPressResults);
  const potCards = betCards.filter((card) => card.isPot);
  // Only worth recommending once every bet is actually final - a plan
  // built on totals that are still moving would just have to be redone.
  const payoutPlan = closed ? computePayoutPlan(settlement) : [];
  const selectedPlayer = allPlayers.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedEntry = selectedPlayerId ? settlementById.get(selectedPlayerId) : undefined;

  // Payment handles are player-scoped, not round-scoped (see paymentHandles
  // in useRoundState), so once the payout plan actually has something to
  // pay, fetch everyone in the round's saved handles in one batch rather
  // than one lookup per transaction.
  const allPlayerIds = allPlayers.map((player) => player.id).join(',');
  useEffect(() => {
    if (!closed || !allPlayerIds) return;
    void loadPaymentHandlesForPlayers(allPlayerIds.split(','));
  }, [closed, allPlayerIds, loadPaymentHandlesForPlayers]);

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
              {payoutPlan.map((tx, index) => {
                const txId = `${tx.fromId}_${tx.toId}`;
                const status = payoutStatus[txId];
                const settled = !!status?.sentByPayer && !!status?.confirmedByPayee;
                return (
                  <View
                    key={`${tx.fromId}-${tx.toId}-${index}`}
                    style={[styles.payoutRow, settled && styles.payoutRowSettled]}
                  >
                    <View style={styles.payoutTopRow}>
                      <Text style={styles.payoutNames} numberOfLines={1}>
                        {tx.fromLabel} <Text style={styles.payoutArrow}>{'\u2192'}</Text> {tx.toLabel}
                      </Text>
                      <Text style={styles.payoutAmount}>{formatAmount(tx.amount)}</Text>
                    </View>
                    <PaymentOptions
                      handles={paymentHandlesByUid[tx.toId]}
                      amount={tx.amount}
                      note={roundCode ? `Then Press Me - ${roundCode}` : 'Then Press Me'}
                    />
                    <PayoutStatusRow
                      isPayer={!!myUid && myUid === tx.fromId}
                      isPayee={!!myUid && myUid === tx.toId}
                      sentByPayer={!!status?.sentByPayer}
                      confirmedByPayee={!!status?.confirmedByPayee}
                      onToggleSent={() => void markPayoutSent(tx.fromId, tx.toId, !status?.sentByPayer)}
                      onToggleConfirmed={() =>
                        void markPayoutConfirmed(tx.fromId, tx.toId, !status?.confirmedByPayee)
                      }
                    />
                  </View>
                );
              })}
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
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  payoutRowSettled: {
    opacity: 0.6,
  },
  payoutTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  paymentOptions: {
    marginTop: 8,
  },
  paymentButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentButton: {
    backgroundColor: '#1a7f37',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  paymentButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  paymentInfoText: {
    color: '#889',
    fontSize: 12,
    marginTop: 4,
  },
  payoutStatusWrap: {
    marginTop: 8,
  },
  payoutStatusRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusChipGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#667',
    fontStyle: 'italic',
  },
  infoBubble: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#eef1f5',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  infoBubbleText: {
    fontSize: 11,
    color: '#556',
  },
  statusChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f7f8fa',
  },
  statusChipDone: {
    backgroundColor: '#eaf6ed',
    borderColor: '#1a7f37',
  },
  statusChipText: {
    color: '#556',
    fontSize: 12,
    fontWeight: '600',
  },
  statusChipTextDone: {
    color: '#1a7f37',
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
