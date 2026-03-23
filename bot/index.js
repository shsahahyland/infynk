/**
 * infynk Teams Bot — Express webhook server
 *
 * Receives messages from Microsoft Teams, queries the infynk /ask API,
 * and responds with an Adaptive Card containing the answer + sources.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const PORT = process.env.BOT_PORT || 3978;
const INFYNK_API = process.env.INFYNK_API_URL || 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Helper: strip @mention prefix from Teams messages
// ---------------------------------------------------------------------------
function stripMention(text) {
  // Teams wraps mentions in <at>...</at> tags
  return text.replace(/<at>.*?<\/at>\s*/gi, '').trim();
}

// ---------------------------------------------------------------------------
// Helper: build Adaptive Card from infynk response
// ---------------------------------------------------------------------------
function buildAdaptiveCard(data) {
  const { answer, sources, confidence } = data;
  const pct = Math.round((confidence || 0) * 100);

  let confidenceColor = 'Good'; // green
  if (confidence < 0.7) confidenceColor = 'Warning'; // yellow
  if (confidence < 0.4) confidenceColor = 'Attention'; // red

  const sourceFacts = (sources || []).slice(0, 5).map((src) => {
    const title =
      src.metadata?.file ||
      src.metadata?.title ||
      src.metadata?.summary ||
      src.metadata?.key ||
      src.document_id ||
      'Unknown';
    return { title: `[${src.source}]`, value: title };
  });

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: '🔍 infynk answer',
        weight: 'Bolder',
        size: 'Medium',
      },
      {
        type: 'TextBlock',
        text: answer || 'No answer available.',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: 'Sources',
        weight: 'Bolder',
        spacing: 'Medium',
      },
      {
        type: 'FactSet',
        facts: sourceFacts.length > 0 ? sourceFacts : [{ title: '-', value: 'No sources found' }],
      },
      {
        type: 'TextBlock',
        text: `Confidence: ${pct}%`,
        color: confidenceColor,
        size: 'Small',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// POST /api/messages — Teams webhook endpoint
// ---------------------------------------------------------------------------
app.post('/api/messages', async (req, res) => {
  const activity = req.body;

  // Only handle message activities
  if (activity.type !== 'message') {
    return res.status(200).json({});
  }

  const rawText = activity.text || '';
  const question = stripMention(rawText);

  if (!question) {
    return res.status(200).json({
      type: 'message',
      text: 'Please ask me a question! Example: "Where is authentication handled?"',
    });
  }

  console.log(`[infynk-bot] Question received: ${question}`);

  try {
    const response = await axios.post(
      `${INFYNK_API}/ask`,
      { question },
      { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );

    const card = buildAdaptiveCard(response.data);

    return res.status(200).json({
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: card,
        },
      ],
    });
  } catch (err) {
    console.error(`[infynk-bot] Error calling /ask: ${err.message}`);
    return res.status(200).json({
      type: 'message',
      text: `❌ Sorry, I couldn't get an answer. Error: ${err.message}`,
    });
  }
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'infynk-teams-bot' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`[infynk-bot] 🤖 Teams bot listening on port ${PORT}`);
  console.log(`[infynk-bot] Backend API: ${INFYNK_API}`);
});
