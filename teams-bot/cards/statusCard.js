'use strict';

function buildStatusCard(health, stats) {
  const h = health || {};
  const s = stats || {};
  const online = h.status === 'ok' || h.status === 'healthy';
  const dot = online ? '●' : '○';
  const statusText = `${dot} Backend ${online ? 'Online' : 'Offline'}`;
  const statusColor = online ? 'Good' : 'Attention';
  const containerStyle = online ? 'good' : 'attention';

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
        type: 'TextBlock',
        text: 'STATUS',
        size: 'Small',
        weight: 'Bolder',
        isSubtle: true,
        spacing: 'Small',
      },
      {
        type: 'Container',
        style: containerStyle,
        items: [
          {
            type: 'TextBlock',
            text: statusText,
            weight: 'Bolder',
            color: statusColor,
          },
        ],
      },
      {
        type: 'TextBlock',
        text: 'KNOWLEDGE GRAPH',
        size: 'Small',
        weight: 'Bolder',
        isSubtle: true,
        spacing: 'Medium',
      },
      {
        type: 'FactSet',
        facts: [
          { title: 'Nodes', value: (s.nodes || 0).toLocaleString() },
          { title: 'Edges', value: (s.edges || 0).toLocaleString() },
        ],
      },
    ],
  };
}

module.exports = { buildStatusCard };
