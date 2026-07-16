/* =========================================================
   DEBATEARENA — Cloud Functions (2nd gen)

   1. generateHotTopics — runs on a daily schedule, asks Gemini
      for today's debate-worthy topics, writes them to
      Firestore at hotTopics/{YYYY-MM-DD}. The client reads
      that doc directly — no function call needed at read time.

   2. cleanupStaleQueue — runs every 5 minutes and deletes
      matchmaking-queue entries from players who searched and
      then closed the app, so they don't get "found" hours later.
   ========================================================= */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-2.0-flash";

const TOPIC_PROMPT = `You write prompts for a debate-practice app. Give me 6 topics people
are actually discussing and disagreeing about right now (current events, tech, culture,
policy, science) — the kind of thing that would spark a genuine 1v1 debate between two
strangers today. Keep each topic to one sentence, phrased as a debatable claim or question,
suitable for a general audience. Vary the categories.

Respond with ONLY a JSON array, no prose, no markdown fences, in exactly this shape:
[{"text": "...", "tag": "..."}, ...]
"tag" is a short one-or-two word category label (e.g. "Tech", "Policy", "Culture").`;

async function fetchTopicsFromGemini(apiKey) {
  const response = await fetch(
    `https://gemini.googleapis.com/v1/models/${GEMINI_MODEL}:generateText`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        prompt: { text: TOPIC_PROMPT },
        temperature: 0.7,
        maxOutputTokens: 800
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const payload = await response.json();
  const raw =
    payload?.candidates?.[0]?.output ||
    payload?.candidates?.[0]?.content?.[0]?.text ||
    payload?.response?.output ||
    "";

  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
  const topics = JSON.parse(cleaned);

  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("Gemini returned an empty or invalid topic list");
  }
  return topics
    .filter((t) => t && typeof t.text === "string")
    .slice(0, 8)
    .map((t) => ({ text: t.text.trim(), tag: (t.tag || "Topic").trim() }));
}

function todayKeyUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches client's todayStr()
}

async function generateAndStore(apiKey) {
  const topics = await fetchTopicsFromGemini(apiKey);
  const dateKey = todayKeyUTC();
  await admin.firestore().collection("hotTopics").doc(dateKey).set({
    topics,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "gemini"
  });
  return { dateKey, count: topics.length };
}

// --- Scheduled: runs automatically once a day. ---
exports.generateHotTopics = onSchedule(
  {
    schedule: "0 5 * * *",       // 05:00 UTC every day — adjust to taste
    timeZone: "Etc/UTC",
    secrets: [GEMINI_API_KEY],
    retryCount: 2
  },
  async () => {
    const result = await generateAndStore(GEMINI_API_KEY.value());
    console.log(`Hot topics generated for ${result.dateKey}: ${result.count} topics`);
  }
);

// --- Manual trigger for testing / backfilling a specific day. ---
// Deploy this too, then hit its URL once (or `firebase functions:shell`) to
// generate today's topics on demand without waiting for the schedule.
exports.generateHotTopicsNow = onRequest(
  { secrets: [GEMINI_API_KEY] },
  async (req, res) => {
    try {
      const result = await generateAndStore(GEMINI_API_KEY.value());
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  }
);

// --- Scheduled: sweeps abandoned matchmaking entries. ---
exports.cleanupStaleQueue = onSchedule("every 5 minutes", async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 5 * 60 * 1000);
  const staleSnap = await admin.firestore()
    .collection("matchQueue")
    .where("status", "==", "waiting")
    .where("createdAt", "<", cutoff)
    .get();

  if (staleSnap.empty) return;
  const batch = admin.firestore().batch();
  staleSnap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`Cleaned up ${staleSnap.size} stale queue entries`);
});
