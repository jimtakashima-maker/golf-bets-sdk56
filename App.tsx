import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import SplashScreen from './src/screens/SplashScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import JoinMatchScreen from './src/screens/JoinMatchScreen';
import JoinGroupScreen from './src/screens/JoinGroupScreen';
import StartMatchScreen from './src/screens/StartMatchScreen';
import ScanScorecardScreen from './src/screens/ScanScorecardScreen';
import RoundScreen from './src/screens/RoundScreen';
import MyHistoryScreen from './src/screens/MyHistoryScreen';
import MyStatsScreen from './src/screens/MyStatsScreen';
import RoundDetailScreen from './src/screens/RoundDetailScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminScreen from './src/screens/AdminScreen';
import LegalScreen from './src/screens/LegalScreen';
import { useRoundState, getSavedActiveRound, type SavedActiveRound } from './src/state/useRoundState';

type Screen =
  | 'splash'
  | 'profileGate'
  | 'welcome'
  | 'join'
  | 'joinGroup'
  | 'start'
  | 'scan'
  | 'round'
  | 'history'
  | 'stats'
  | 'roundDetail'
  | 'profile'
  | 'admin'
  | 'legal';

// Pulls the round code out of a thenpressme://join?code=XXXXX link (the
// QR on the Match Started screen encodes this) - a plain regex rather than
// the URL global, which Hermes doesn't reliably provide.
function extractRoundCode(url: string): string | null {
  // Primary format: thenpressme://join/XXXXX - an all-uppercase,
  // letters/digits/":"+"/" only URL. Those characters all fall inside the
  // QR "alphanumeric" charset, which packs roughly 5.5 bits/char instead
  // of the 8 bits/char a lowercase or "?"/"="-bearing URL forces (byte
  // mode) - a meaningfully smaller, more reliably-scannable code for the
  // same physical size. The old query-string form is still accepted as a
  // fallback in case an older QR is scanned.
  const pathMatch = url.match(/join\/([a-z0-9]+)/i);
  if (pathMatch) return pathMatch[1].toUpperCase();
  const queryMatch = url.match(/[?&]code=([^&]+)/i);
  return queryMatch ? decodeURIComponent(queryMatch[1]).toUpperCase() : null;
}

export default function App() {
  // The app always opens on the profile screen first, so a display name
  // and handicap get confirmed (or corrected) before a round can be
  // created or joined - see ProfileScreen's onContinue ("gate") mode.
  const [screen, setScreen] = useState<Screen>('splash');
  const [pendingJoin, setPendingJoin] = useState<{ roundCode: string; name: string } | null>(null);
  // Profile can be opened from the welcome screen or from mid-round, so
  // remember where to send 'Back' back to instead of hardcoding welcome.
  const [profileReturnScreen, setProfileReturnScreen] = useState<Screen>('welcome');
  // Legal can be opened from Welcome or from Profile - same "remember
  // where 'Back' goes" pattern as profileReturnScreen above.
  const [legalReturnScreen, setLegalReturnScreen] = useState<Screen>('welcome');
  // Which past round History's "View Round" screen is currently open to -
  // set right before setScreen('roundDetail'), read by the render below.
  const [viewingRoundCode, setViewingRoundCode] = useState<string | null>(null);
  const rejoinRound = useRoundState((state) => state.rejoinRound);
  const profile = useRoundState((state) => state.profile);
  const [savedRound, setSavedRound] = useState<SavedActiveRound | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  // A round code pulled from a scanned QR / deep link, waiting to be handed
  // to the Join screen once the profile gate (and any cold-start timing) is
  // out of the way.
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  // Offer to resume a round left mid-play (e.g. the app was closed) instead
  // of stranding the player at the welcome screen with no way back in.
  useEffect(() => {
    getSavedActiveRound().then(setSavedRound);
  }, []);

  // Deep links: cold-started via the link (getInitialURL) or tapped while
  // the app is already running (the 'url' event) - either way, remember the
  // code and jump to Join once we're past the profile gate.
  useEffect(() => {
    const applyUrl = (url: string | null) => {
      if (!url) return;
      const code = extractRoundCode(url);
      if (code) setPendingCode(code);
    };
    Linking.getInitialURL().then(applyUrl);
    const subscription = Linking.addEventListener('url', (event) => applyUrl(event.url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (pendingCode && screen === 'welcome') {
      setScreen('join');
    }
  }, [pendingCode, screen]);

  const handleResume = async () => {
    if (!savedRound) return;
    setResuming(true);
    setResumeError(null);
    try {
      await rejoinRound(savedRound.roundCode, savedRound.groupId);
      setScreen('round');
    } catch (error) {
      setResumeError((error as Error).message);
    } finally {
      setResuming(false);
    }
  };

  if (screen === 'splash') {
    return <SplashScreen onDone={() => setScreen('profileGate')} />;
  }

  if (screen === 'profileGate') {
    return <ProfileScreen onContinue={() => setScreen('welcome')} />;
  }

  if (screen === 'join') {
    return (
      <JoinMatchScreen
        initialCode={pendingCode ?? undefined}
        onPickedRound={(roundCode, name) => {
          setPendingCode(null);
          setPendingJoin({ roundCode, name });
          setScreen('joinGroup');
        }}
        onBack={() => {
          setPendingCode(null);
          setScreen('welcome');
        }}
      />
    );
  }

  if (screen === 'joinGroup' && pendingJoin) {
    return (
      <JoinGroupScreen
        roundCode={pendingJoin.roundCode}
        name={pendingJoin.name}
        onJoined={() => setScreen('round')}
        onBack={() => setScreen('join')}
      />
    );
  }

  if (screen === 'start') {
    return (
      <StartMatchScreen
        onStarted={() => setScreen('round')}
        onScanScorecard={() => setScreen('scan')}
        onBack={() => setScreen('welcome')}
      />
    );
  }

  if (screen === 'scan') {
    return (
      <ScanScorecardScreen onDone={() => setScreen('start')} onBack={() => setScreen('start')} />
    );
  }

  if (screen === 'round') {
    return (
      <RoundScreen
        onLeaveRound={() => setScreen('welcome')}
        onProfile={() => {
          setProfileReturnScreen('round');
          setScreen('profile');
        }}
      />
    );
  }

  if (screen === 'history') {
    return (
      <MyHistoryScreen
        onBack={() => setScreen('welcome')}
        onViewRound={(roundCode) => {
          setViewingRoundCode(roundCode);
          setScreen('roundDetail');
        }}
      />
    );
  }

  if (screen === 'stats') {
    return <MyStatsScreen onBack={() => setScreen('welcome')} />;
  }

  if (screen === 'roundDetail' && viewingRoundCode) {
    return (
      <RoundDetailScreen
        roundCode={viewingRoundCode}
        onBack={() => {
          setViewingRoundCode(null);
          setScreen('history');
        }}
      />
    );
  }

  if (screen === 'admin') {
    return <AdminScreen onBack={() => setScreen('welcome')} />;
  }

  if (screen === 'legal') {
    return <LegalScreen onBack={() => setScreen(legalReturnScreen)} />;
  }

  if (screen === 'profile') {
    return (
      <ProfileScreen
        onBack={() => setScreen(profileReturnScreen)}
        onLegal={() => {
          setLegalReturnScreen('profile');
          setScreen('legal');
        }}
      />
    );
  }

  return (
    <WelcomeScreen
      onJoin={() => setScreen('join')}
      onStart={() => setScreen('start')}
      onHistory={() => setScreen('history')}
      onStats={() => setScreen('stats')}
      onProfile={() => {
        setProfileReturnScreen('welcome');
        setScreen('profile');
      }}
      onLegal={() => {
        setLegalReturnScreen('welcome');
        setScreen('legal');
      }}
      onAdmin={profile?.isAdmin ? () => setScreen('admin') : undefined}
      resumeAvailable={!!savedRound}
      resuming={resuming}
      resumeError={resumeError}
      onResume={handleResume}
    />
  );
}
