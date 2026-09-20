// Reads the printed par/handicap-index grid off a photographed golf
// scorecard using the Gemini API's vision + structured-output support.
//
// NOTE ON API KEY EXPOSURE: this key ships inside the app bundle (like the
// Firebase config), which is fine for internal testing with a small group
// but should move behind a backend (e.g. a Firebase Cloud Function) before
// any public App Store release - anyone with the installed app could in
// principle extract this key. Flagging this here so it is not forgotten.

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// Overridable in case a newer/cheaper model is available by the time this
// is set up - check https://ai.google.dev/gemini-api/docs/models for the
// current lineup. gemini-3.6-flash is the current default (gemini-2.5-flash
// stopped resolving on this API version as of Sept 2026).
const MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-3.6-flash';

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface ScannedHole {
  hole: number;
  par: number;
  handicapIndex: number;
}

const PROMPT = `You are reading a printed golf course scorecard from a photo.

Read only the holes actually printed on this card. It may show a full 18-hole
layout - sometimes as two row blocks, front nine and back nine, which should
be combined into one list - or it may show only 9 holes (a 9-hole course, or
one nine of a multi-nine facility). Do not invent a hole that isn't printed
on the card.

For each hole that IS printed, extract:
- "hole": the hole number as printed (1-9 for a 9-hole card, or 1-18)
- "par": the par value printed for that hole (usually 3, 4, or 5)
- "handicapIndex": the handicap / stroke index printed for that hole (usually
  labeled "HDCP", "HANDICAP", "INDEX", or similar)

If a value for a hole that IS printed is unreadable, make your best guess for
that value rather than omitting the hole - but never add a hole number that
isn't shown on the card.`;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      hole: { type: 'INTEGER' },
      par: { type: 'INTEGER' },
      handicapIndex: { type: 'INTEGER' },
    },
    required: ['hole', 'par', 'handicapIndex'],
  },
};

export function isGeminiConfigured(): boolean {
  return !!API_KEY;
}

// Gemini occasionally returns 503 (model overloaded) or 429 (rate limited)
// under load - both are transient, so it's worth a couple of short retries
// before making the user retake the photo and try again themselves.
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUSES = new Set([503, 429]);

async function fetchWithRetry(requestBody: string): Promise<Response> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
    } catch {
      throw new Error('Could not reach Gemini - check your network connection and try again.');
    }

    if (response.ok) return response;

    const isLastAttempt = attempt === MAX_ATTEMPTS;
    if (!RETRYABLE_STATUSES.has(response.status) || isLastAttempt) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(
        response.status === 503
          ? 'Gemini is temporarily overloaded - please try again in a moment.'
          : `Gemini request failed (${response.status}). ${responseBody.slice(0, 200)}`
      );
    }

    // Brief backoff before retrying - 0.8s, then 1.6s.
    await new Promise((resolve) => setTimeout(resolve, attempt * 800));
  }

  // Unreachable in practice (the loop always returns or throws above) -
  // just here to satisfy the return type.
  throw new Error('Gemini request failed after retrying.');
}

/**
 * Sends a base64-encoded photo of a scorecard to Gemini and returns the
 * per-hole par/handicap-index data it read off the printed grid. Throws
 * with a message suitable for showing directly to the user on failure.
 */
export async function scanScorecard(base64Image: string, mimeType: string): Promise<ScannedHole[]> {
  if (!API_KEY) {
    throw new Error(
      'Gemini API key is not configured. Add EXPO_PUBLIC_GEMINI_API_KEY to .env.'
    );
  }

  const requestBody = JSON.stringify({
    contents: [
      {
        parts: [
          { text: PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Image } },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: RESPONSE_SCHEMA,
    },
  });

  const response = await fetchWithRetry(requestBody);

  const json = await response.json();
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response - try a clearer photo.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Could not understand the response from Gemini - try again.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected response shape from Gemini - try again.');
  }

  const holes = parsed
    .filter(
      (entry): entry is ScannedHole =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as ScannedHole).hole === 'number' &&
        typeof (entry as ScannedHole).par === 'number' &&
        typeof (entry as ScannedHole).handicapIndex === 'number'
    )
    .filter((entry) => entry.hole >= 1 && entry.hole <= 18);

  if (holes.length === 0) {
    throw new Error('Could not read any holes off that photo - try a clearer, flatter shot.');
  }

  return holes;
}
