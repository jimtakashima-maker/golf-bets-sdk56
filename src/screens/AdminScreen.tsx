import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRoundState, FeedbackEntry } from '../state/useRoundState';
import BackButton from '../components/BackButton';

function formatWhen(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface AdminScreenProps {
  onBack: () => void;
}

// A dev-only screen: reachable at all only because Welcome hides the link
// to it unless the signed-in profile has isAdmin set (see PlayerProfile),
// and the feedback list itself is only readable by that same profile per
// database.rules.json - so this stays private even to someone who guesses
// the URL scheme or pokes at the app's internals. The one thing this
// screen does is read back what "Send Feedback" on Welcome writes.
export default function AdminScreen({ onBack }: AdminScreenProps) {
  const fetchFeedback = useRoundState((state) => state.fetchFeedback);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      setError(null);
      try {
        const result = await fetchFeedback();
        setEntries(result);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchFeedback]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Feedback</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a7f37" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.empty}>
            Couldn't load feedback - {error}. Pull down to try again.
          </Text>
        </View>
      ) : entries.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.centered}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          <Text style={styles.empty}>Nothing sent in yet.</Text>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          {entries.map((entry) => (
            <View key={entry.id} style={styles.row}>
              <Text style={styles.rowText}>{entry.text}</Text>
              <Text style={styles.rowMeta}>
                {entry.byName ?? 'Anonymous'} · {formatWhen(entry.createdAt)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
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
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
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
  },
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  rowText: {
    fontSize: 14,
    color: '#234',
    lineHeight: 20,
  },
  rowMeta: {
    fontSize: 12,
    color: '#889',
    marginTop: 6,
  },
});
