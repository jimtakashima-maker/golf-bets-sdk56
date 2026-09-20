import { Share } from 'react-native';

// A host's round code is the only thing a fellow player needs to join, so
// invites are just that code dropped into the native share sheet - the
// player picks whatever app they'd actually text it through (Messages,
// WhatsApp, email, etc.) rather than the app assuming SMS specifically.
export async function shareRoundInvite(roundCode: string): Promise<void> {
  try {
    await Share.share({
      message: `Join my round on Then Press Me! Open the app and enter code ${roundCode} to join.`,
    });
  } catch {
    // Share sheet was dismissed or unavailable - nothing to recover from.
  }
}
