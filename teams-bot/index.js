'use strict';

require('dotenv').config();

const express = require('express');
const { CloudAdapter, ConfigurationBotFrameworkAuthentication, MessageFactory, CardFactory } = require('botbuilder');
const { InfynkBot } = require('./bot');
const { buildErrorCard } = require('./cards/answerCard');

const PORT = parseInt(process.env.PORT || '3978', 10);

const app = express();
app.use(express.json());

const auth = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: process.env.MICROSOFT_APP_ID || '',
  MicrosoftAppPassword: process.env.MICROSOFT_APP_PASSWORD || '',
});

const adapter = new CloudAdapter(auth);

adapter.onTurnError = async (context, error) => {
  console.error('[onTurnError]', error);
  try {
    await context.sendActivity(
      MessageFactory.attachment(CardFactory.adaptiveCard(buildErrorCard(String(error)))),
    );
  } catch (sendErr) {
    console.error('[onTurnError] Failed to send error card:', sendErr);
  }
};

const bot = new InfynkBot();

app.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'infynk-teams-bot' }));

app.listen(PORT, () => {
  console.log(`infynk Teams bot listening on http://localhost:${PORT}/api/messages`);
  console.log(`Backend URL: ${process.env.INFYNK_BACKEND_URL || 'http://localhost:8000'}`);
});
