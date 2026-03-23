'use strict';

function buildIngestCard(result) {
  const r = result || {};
  const success =
    r.status === 'ok' ||
    r.status === 'success' ||
    (r.documents_ingested != null && r.status !== 'error');

  const icon = success ? '✓' : '✗';
  const heading = `${icon} Ingestion ${success ? 'complete' : 'failed'}`;
  const containerStyle = success ? 'good' : 'attention';
  const headingColor = success ? 'Good' : 'Attention';

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
        size: 'Medium',
      },
      {
        type: 'Container',
        style: containerStyle,
        items: [
          {
            type: 'TextBlock',
            text: heading,
            weight: 'Bolder',
            color: headingColor,
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Documents ingested', value: String(r.documents_ingested ?? 0) },
              { title: 'Graph nodes',         value: String(r.graph_nodes ?? 0) },
              { title: 'Graph edges',         value: String(r.graph_edges ?? 0) },
            ],
          },
        ],
      },
    ],
  };
}

module.exports = { buildIngestCard };
