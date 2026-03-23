'use strict';

const { ActivityHandler, MessageFactory, CardFactory } = require('botbuilder');
const { askQuestion, triggerIngest, getHealth, getGraphStats } = require('./apiClient');
const { buildAnswerCard, buildErrorCard, buildOfflineCard } = require('./cards/answerCard');
const { buildIngestCard } = require('./cards/ingestCard');
const { buildStatusCard } = require('./cards/statusCard');
const { buildHelpCard } = require('./cards/helpCard');

const DEFAULT_TEAM = 'Automate';
const VALID_TEAMS = ['automate', 'payments', 'platform'];

// In-memory conversation state: conversationId → { activeTeam }
const conversationState = new Map();

function getState(conversationId) {
  if (!conversationState.has(conversationId)) {
    conversationState.set(conversationId, { activeTeam: DEFAULT_TEAM });
  }
  return conversationState.get(conversationId);
}

async function sendCard(context, cardJson) {
  await context.sendActivity(
    MessageFactory.attachment(CardFactory.adaptiveCard(cardJson)),
  );
}

function isBackendOffline(err) {
  const msg = String(err).toLowerCase();
  return msg.includes('econnrefused') || msg.includes('fetch failed') || msg.includes('etimedout');
}

// Strip the bot's own @mention from channel message text
function stripBotMention(activity) {
  let text = (activity.text || '').trim();
  const botId = activity.recipient && activity.recipient.id;
  if (botId) {
    (activity.entities || []).forEach((entity) => {
      if (
        entity.type === 'mention' &&
        entity.mentioned &&
        entity.mentioned.id === botId &&
        entity.text
      ) {
        text = text.replace(entity.text, '').trim();
      }
    });
  }
  return text;
}

async function handleQuestion(context, question, activeTeam) {
  if (!question) {
    await context.sendActivity(MessageFactory.text('Please type a question.'));
    return;
  }
  await context.sendActivity({ type: 'typing' });
  try {
    const result = await askQuestion({ question, user_team: activeTeam });
    await sendCard(context, buildAnswerCard(result));
  } catch (err) {
    if (isBackendOffline(err)) {
      await sendCard(context, buildOfflineCard());
    } else {
      await sendCard(context, buildErrorCard(String(err)));
    }
  }
}

async function handleTeamCommand(context, argStr, state) {
  const teamName = (argStr || '').trim();
  const matched = VALID_TEAMS.find((t) => t === teamName.toLowerCase());
  if (!matched) {
    await context.sendActivity(
      MessageFactory.text(
        `Unknown team "${teamName}". Valid options: Automate, Payments, Platform.`,
      ),
    );
    return;
  }
  state.activeTeam = matched.charAt(0).toUpperCase() + matched.slice(1);
  await context.sendActivity(
    MessageFactory.text(`✓ Active team set to **${state.activeTeam}**.`),
  );
}

// Handle Adaptive Card Action.Submit data (from follow-up card)
async function handleCardSubmit(context, value, state) {
  if (value.type === 'followup') {
    const question = (value.followupQuestion || '').trim();
    if (!question) {
      await context.sendActivity(MessageFactory.text('Please type your follow-up question.'));
      return;
    }
    await handleQuestion(context, question, state.activeTeam);
  }
}

class InfynkBot extends ActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const conversationId = context.activity.conversation.id;
      const state = getState(conversationId);

      // Handle Adaptive Card Action.Submit (activity has value but no text)
      if (context.activity.value && !context.activity.text) {
        try {
          await handleCardSubmit(context, context.activity.value, state);
        } catch (err) {
          console.error('[bot card submit]', err);
          await sendCard(context, buildErrorCard(String(err)));
        }
        await next();
        return;
      }

      const text = stripBotMention(context.activity);
      if (!text) {
        await next();
        return;
      }

      const spaceIdx = text.indexOf(' ');
      const cmd = (spaceIdx === -1 ? text : text.slice(0, spaceIdx)).toLowerCase();
      const argStr = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim();

      try {
        if (cmd === 'help') {
          await sendCard(context, buildHelpCard(state.activeTeam));
        } else if (cmd === 'ingest') {
          await context.sendActivity({ type: 'typing' });
          const result = await triggerIngest();
          await sendCard(context, buildIngestCard(result));
        } else if (cmd === 'status') {
          await context.sendActivity({ type: 'typing' });
          const [health, stats] = await Promise.all([getHealth(), getGraphStats()]);
          await sendCard(context, buildStatusCard(health, stats));
        } else if (cmd === 'team') {
          await handleTeamCommand(context, argStr, state);
        } else if (cmd === 'ask') {
          await handleQuestion(context, argStr, state.activeTeam);
        } else {
          // Any unrecognised message is treated as a question
          await handleQuestion(context, text, state.activeTeam);
        }
      } catch (err) {
        console.error('[bot onMessage]', err);
        if (isBackendOffline(err)) {
          await sendCard(context, buildOfflineCard());
        } else {
          await sendCard(context, buildErrorCard(String(err)));
        }
      }

      await next();
    });

    // Greet new members with the help card
    this.onMembersAdded(async (context, next) => {
      const botId = context.activity.recipient && context.activity.recipient.id;
      for (const member of context.activity.membersAdded || []) {
        if (member.id !== botId) {
          await sendCard(context, buildHelpCard(DEFAULT_TEAM));
        }
      }
      await next();
    });
  }
}

module.exports = { InfynkBot };
