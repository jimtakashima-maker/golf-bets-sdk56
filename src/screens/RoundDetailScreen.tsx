import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRoundState, BetCard } from '../state/useRoundState';
import { auth } from '../lib/firebase';
import BackButton from '../components/BackButton';
import RoundScorecardGrid from '../components/RoundScorecardGrid';
import {
  formatAmount,
  formatSigned,
  computePayoutPlan,
  PaymentOptions,
  PayoutStatusRow,
  PlayerBreakdownModal,
  BetCardView,
} from './SettlementScreen';

function formatDate(ms: number | null): string {
  if (!ms) return 'Unknown date';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

type DetailTab = 'scorecard' | 'players' | 'bets' | 'payout';

const TABS: Array<{ key: DetailTab; label: string }> = [
  { key: 'scorecard', label: 'Scorecard' },
  { key: 'players', label: 'Players' },
  { key: 'bets', label: 'Bets' },
  { key: 'payout', label: 'Payout' },
];

// History's "View Round" screen - everything about one past round in one
// place: the full hole-by-hole scorecard, the same players/bets breakdown
// Settlement shows live, and a payout plan that's fully interactive (pay
// via Venmo/PayPal/Cash App, mark sent/confirmed) but locked once each side
// of a payment is marked, since a settled round shouldn't be re-litigated
// by an accidental tap months later. Backed by loadHistoricalRound/
// subscribeToHistoricalPayoutStatus in useRoundState, entirely separate
// from whatever round this device might currently be playing live.
export default function RoundDetailScreen({ roundCode, onBack }: { roundCode: string; onBack: () => void }) {
  const historicalRound = useRoundState((state) => state.historicalRound);
  const historicalRoundLoading = useRoundState((state) => state.historicalRoundLoading);
  const historicalRoundError = useRoundState((state) => state.historicalRoundError);
  const loadHistoricalRound = useRoundState((state) => state.loadHistoricalRound);
  const subscribeToHistoricalPayoutStatus = useRoundState((state) => state.subscribeToHistoricalPayoutStatus);
  const clearHistoricalRound = useRoundState((state) => state.clearHistoricalRound);
  const paymentHandlesByUid = useRoundState((state) => state.paymentHandlesByUid);
  const loadPaymentHandlesForPlayers = useRoundState((state) => state.loadPaymentHandlesForPlayers);
  const markPayoutSent = useRoundState((state) => state.markPayoutSent);
  const markPayoutConfirmed = useRoundState((state) => state.markPayoutConfirmed);

  const [activeTab, setActiveTab] = useState<DetailTab>('scorecard');
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const myUid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    void loadHistoricalRound(roundCode);
    const unsubscribe = subscribeToHistoricalPayoutStatus(roundCode);
    return () => {
      unsubscribe();
      clearHistoricalRound();
    };
    // roundCode is fixed for the life of this screen - re-running this
    // effect if it somehow changed would leave a stale subscription
    // attached to the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundCode]);

  const allPlayers = historicalRound?.groups.flatMap((group) => group.players) ?? [];
  const allPlayerIds = allPlayers.map((player) => player.id).join(',');
  useEffect(() => {
    if (!allPlayerIds) return;
    void loadPaymentHandlesForPlayers(allPlayerIds.split(','));
  }, [allPlayerIds, loadPaymentHandlesForPlayers]);

  if (historicalRoundLoading || !historicalRound) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <BackButton onPress={onBack} />
          <Text style={styles.title}>Round Detail</Text>
        </View>
        <View style={styles.centered}>
          {historicalRoundError ? (
            <Text style={styles.empty}>{historicalRoundError}</Text>
          ) : (
            <ActivityIndicator size="large" color="#1a7f37" />
          )}
        </View>
      </View>
    );
  }

  const { courseName, totalHoles, createdAt, groups, handicaps, settlement, betCards, payoutStatus } = historicalRound;
  const settlementById = new Map(settlement.map((entry) => [entry.id, entry]));
  const potCards = betCards.filter((card) => card.isPot);
  const payoutPlan = computePayoutPlan(settlement);
  const selectedPlayer = allPlayers.find((player) => player.id === selectedPlayerId) ?? null;
  const selectedEntry = selectedPlayerId ? settlementById.get(selectedPlayerId) : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>{courseName ?? 'Round'}</Text>
        <Text style={styles.subtitle}>
          {formatDate(createdAt)} {'·'} {totalHoles} holes
        </Text>

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

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {activeTab === 'scorecard' &&
          (groups.length === 0 ? (
            <Text style={styles.empty}>No scores recorded for this round.</Text>
          ) : (
            groups.map((group) => (
              <RoundScorecardGrid
                key={group.id}
                groupName={group.name}
                players={group.players}
                scores={group.scores}
                holes={historicalRound.holes}
                totalHoles={totalHoles}
                handicaps={handicaps}
              />
            ))
          ))}

        {activeTab === 'players' &&
          (allPlayers.length === 0 ? (
            <Text style={styles.empty}>No players in this round.</Text>
          ) : (
            allPlayers.map((player) => {
              const entry = settlementById.get(player.id);
              const amount = entry?.amount ?? 0;
              const hasActivity = !!entry && entry.breakdown.length > 0;
              return (
                <Pressable key={player.id} style={styles.row} onPress={() => setSelectedPlayerId(player.id)}>
                  <Text style={styles.playerName}>{player.name}</Text>
                  {!hasActivity ? (
                    <Text style={styles.evenText}>Nothing settled</Text>
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
            <Text style={styles.empty}>No bets settled this round.</Text>
          ) : (
            betCards.map((card: BetCard) => <BetCardView key={card.key} card={card} />)
          ))}

        {activeTab === 'payout' &&
          (payoutPlan.length === 0 ? (
            <Text style={styles.empty}>Everyone was square - nobody owed anything.</Text>
          ) : (
            <>
              <Text style={styles.payoutCount}>
                {payoutPlan.length} {payoutPlan.length === 1 ? 'payment' : 'payments'} settled this round
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
                        {tx.fromLabel} <Text style={styles.payoutArrow}>{'→'}</Text> {tx.toLabel}
                      </Text>
                      <Text style={styles.payoutAmount}>{formatAmount(tx.amount)}</Text>
                    </View>
                    <PaymentOptions
                      handles={paymentHandlesByUid[tx.toId]}
                      amount={tx.amount}
                      note={`Then Press Me - ${roundCode}`}
                    />
                    <PayoutStatusRow
                      isPayer={!!myUid && myUid === tx.fromId}
                      isPayee={!!myUid && myUid === tx.toId}
                      sentByPayer={!!status?.sentByPayer}
                      confirmedByPayee={!!status?.confirmedByPayee}
                      locked
                      sentAt={status?.sentAt ?? null}
                      confirmedAt={status?.confirmedAt ?? null}
                      onToggleSent={() => void markPayoutSent(tx.fromId, tx.toId, !status?.sentByPayer, roundCode)}
                      onToggleConfirmed={() =>
                        void markPayoutConfirmed(tx.fromId, tx.toId, !status?.confirmedByPayee, roundCode)
                      }
                    />
                  </View>
                );
              })}
            </>
          ))}
      </ScrollView>

      <PlayerBreakdownModal
        visible={selectedPlayerId !== null}
        playerName={selectedPlayer?.name ?? ''}
        breakdown={selectedEntry?.breakdown ?? []}
        totalAmount={selectedEntry?.amount ?? 0}
        onClose={() => setSelectedPlayerId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  subtitle: {
    color: '#889',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  empty: {
    color: '#889',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingVertical: 24,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#fff',
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#889',
  },
  tabButtonTextActive: {
    color: '#234',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#234',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  owedText: {
    color: '#1a7f37',
  },
  owesText: {
    color: '#c0392b',
  },
  evenText: {
    color: '#889',
    fontSize: 13,
  },
  payoutCount: {
    fontSize: 13,
    color: '#556',
    marginBottom: 8,
  },
  payoutRow: {
    backgroundColor: '#f7f8fa',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  payoutRowSettled: {
    backgroundColor: '#eaf6ed',
  },
  payoutTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  payoutNames: {
    fontSize: 14,
    fontWeight: '600',
    color: '#234',
    flex: 1,
    marginRight: 8,
  },
  payoutArrow: {
    color: '#889',
  },
  payoutAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#234',
  },
});
