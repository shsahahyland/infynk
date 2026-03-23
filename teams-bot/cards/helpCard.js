'use strict';

function buildHelpCard(activeTeam) {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        text: 'infynk',
        weight: 'Bolder',
        color: 'Accent',
        size: 'Large',
      },
      {
        type: 'TextBlock',
        text: 'AI Knowledge System for Hyland engineering teams',
        isSubtle: true,
        spacing: 'None',
        wrap: true,
      },
      {
        type: 'TextBlock',
        text: `Active team: **${activeTeam || 'Automate'}**`,
        size: 'Small',
        color: 'Accent',
        spacing: 'Small',
      },
      {
        type: 'TextBlock',
        text: 'COMMANDS',
        size: 'Small',
        weight: 'Bolder',
        isSubtle: true,
        spacing: 'Medium',
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'help',           value: 'Show this help card' },
          { title: 'ask <question>', value: 'Ask a question about the codebase or docs' },
          { title: '<any message>',  value: 'Any message not matching a command is treated as a question' },
          { title: 'ingest',        value: 'Re-ingest all sources for the active team' },
          { title: 'status',        value: 'Show backend health and knowledge graph stats' },
          { title: 'team <name>',   value: 'Set active team — Automate, Payments, or Platform' },
        ],
      },
      {
        type: 'TextBlock',
        text: 'SOURCES',
        size: 'Small',
        weight: 'Bolder',
        isSubtle: true,
        spacing: 'Medium',
      },
      {
        type: 'TextBlock',
        text: '**[GH]** GitHub  ·  **[CF]** Confluence  ·  **[JR]** Jira  ·  **[HD]** HylandDocs',
        wrap: true,
        size: 'Small',
      },
    ],
  };
}

module.exports = { buildHelpCard };
