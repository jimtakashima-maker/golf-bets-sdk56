// Crash reporting + performance monitoring, via Sentry. Wired up so a JS
// exception or native crash anywhere in the app produces a real stack
// trace in the Sentry dashboard instead of just vanishing (or surfacing as
// a vague Alert.alert to whichever one player hit it) - see
// AppErrorBoundary below for the user-facing side of the same problem.
//
// Requires EXPO_PUBLIC_SENTRY_DSN to be set (see .env.example) - initSentry
// and setSentryUser silently no-op without it, so this is safe to leave
// wired up even before a Sentry project/DSN exists.

import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import * as Sentry from '@sentry/react-native';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!DSN) {
    return;
  }
  Sentry.init({
    dsn: DSN,
    // Only report from real builds - a dev-mode fast-refresh reload storm
    // would otherwise flood the free-tier error quota with noise.
    enabled: !__DEV__,
    debug: __DEV__,
    // Performance monitoring: trace a modest sample of sessions rather
    // than every one, to leave headroom in the free tier as usage grows.
    tracesSampleRate: 0.2,
  });
}

// Attaches whichever player is using this device to every event Sentry
// reports from it, so "who hit this" doesn't require guessing from a
// stack trace alone. Safe to call repeatedly (e.g. every time profile
// changes) - Sentry.setUser just overwrites the previous value.
export function setSentryUser(uid: string | undefined, displayName: string | undefined): void {
  if (!DSN) {
    return;
  }
  if (!uid) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: uid, username: displayName });
}

function FallbackScreen({ resetError }: { resetError: () => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>
        Then Press Me hit a snag. It's been reported - tap below to get
        back to the app.
      </Text>
      <Pressable style={styles.button} onPress={resetError}>
        <Text style={styles.buttonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

// Wraps the whole app: catches any render-time exception that would
// otherwise crash the app to a blank/native error screen, reports it to
// Sentry with a full stack trace, and shows this instead so a player can
// tap back in rather than force-quitting.
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return <Sentry.ErrorBoundary fallback={FallbackScreen}>{children}</Sentry.ErrorBoundary>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#1a7f37',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
