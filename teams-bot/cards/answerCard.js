'use strict';

// Matches [Repository:...], [File:...], [Owners:...], [Page:...], [Space:...]
const HEADER_STRIP_RE = /\[(Repository|File|Owners|Page|Space):[^\]]*\]\s*/g;
const HTML_TAG_RE = /<[^>]+>/g;

const MAX_ANSWER_CHARS = 800;
const MAX_SNIPPET_CHARS = 120;
const MAX_SOURCES = 3;

const SOURCE_LABELS = {
  github: 'GH',
  confluence: 'CF',
  jira: 'JR',
  hyland_docs: 'HD',
};

// Adaptive Card TextBlock color values matching frontend badge palette
const SOURCE_BADGE_COLORS = {
  github: 'Accent',      // #4f8cff blue
  confluence: 'Accent',  // #a78bfa purple — closest available is Accent
  jira: 'Warning',       // #ffb347 amber
  hyland_docs: 'Warning', // #f97316 orange — closest is Warning
};

function stripHtml(text) {
  return (text || '').replace(HTML_TAG_RE, '').trim();
}

function stripPrefixes(text) {
  return (text || '').replace(HEADER_STRIP_RE, '').trim();
}

function truncate(text, max) {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function clampConfidence(conf) {
  if (typeof conf !== 'number' || Number.isNaN(conf)) return 0;
  return Math.max(0, Math.min(1, conf));
}

function getConfidenceInfo(conf) {
  if (conf >= 0.7) return { columnStyle: 'good',      label: 'High',   textColor: 'Good' };
  if (conf >= 0.4) return { columnStyle: 'warning',   label: 'Medium', textColor: 'Warning' };
  return              { columnStyle: 'attention', label: 'Low',    textColor: 'Attention' };
}

function deduplicateSources(sources) {
  const seen = new Set();
  return (sources || []).filter((s) => {
    const meta = s.metadata || {};
    let key;
    switch (s.source) {
      case 'github':      key = `gh:${meta.repo || ''}|${meta.file || ''}`; break;
      case 'confluence':  key = `cf:${meta.space || ''}|${meta.title || ''}`; break;
      case 'jira':        key = `jr:${meta.key || ''}`; break;
      case 'hyland_docs': key = `hd:${meta.url || ''}`; break;
      default:            key = `${s.source}:${s.document_id || ''}`;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getSourceTitle(s) {
  const meta = s.metadata || {};
  switch (s.source) {
    case 'github':      return meta.file      || s.document_id || 'Unknown file';
    case 'confluence':  return meta.title     || 'Confluence page';
    case 'jira':        return meta.summary   || meta.key || 'Jira issue';
    case 'hyland_docs': return meta.title     || 'Hyland Docs';
    default:            return s.document_id  || s.source || 'Unknown';
  }
}

function getSourceSubtitle(s) {
  const meta = s.metadata || {};
  switch (s.source) {
    case 'github':
      return (meta.org && meta.repo) ? `${meta.org}/${meta.repo}` : (meta.repo || '');
    case 'confluence':
      return meta.space || '';
    case 'jira':
      return [meta.key, meta.status].filter(Boolean).join(' · ');
    case 'hyland_docs':
      return meta.product || '';
    default:
      return '';
  }
}

function buildSourceBlock(s) {
  const meta = s.metadata || {};
  const badge = SOURCE_LABELS[s.source] || s.source.slice(0, 2).toUpperCase();
  const badgeColor = SOURCE_BADGE_COLORS[s.source] || 'Default';
  const title = getSourceTitle(s);
  const subtitle = getSourceSubtitle(s);
  const snippet = truncate(stripPrefixes(s.snippet || ''), MAX_SNIPPET_CHARS);
  const url = meta.url || null;

  const titleColumn = {
    type: 'Column',
    width: 'stretch',
    items: [
      { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Small', wrap: false, spacing: 'None' },
      ...(subtitle
        ? [{ type: 'TextBlock', text: subtitle, size: 'Small', isSubtle: true, spacing: 'None', wrap: false }]
        : []),
    ],
  };

  const containerItems = [
    {
      type: 'ColumnSet',
      columns: [
        {
          type: 'Column',
          width: 'auto',
          items: [{ type: 'TextBlock', text: `[${badge}]`, weight: 'Bolder', color: badgeColor, size: 'Small', spacing: 'None' }],
        },
        titleColumn,
      ],
      spacing: 'None',
    },
    ...(snippet
      ? [{ type: 'TextBlock', text: snippet, size: 'Small', isSubtle: true, wrap: true, maxLines: 2, spacing: 'Small' }]
      : []),
    ...(url
      ? [{
          type: 'ActionSet',
          actions: [{ type: 'Action.OpenUrl', title: 'Open ↗', url }],
          spacing: 'Small',
        }]
      : []),
  ];

  return {
    type: 'Container',
    style: 'emphasis',
    spacing: 'Small',
    items: containerItems,
  };
}

function buildConfidenceBar(confidence) {
  const conf = clampConfidence(confidence);
  const { columnStyle, label, textColor } = getConfidenceInfo(conf);
  const pct = Math.round(conf * 100);
  // Clamp filled/empty so neither column is zero-width (invalid)
  const filled = Math.max(1, Math.min(99, pct));
  const empty = 100 - filled;

  return [
    {
      type: 'TextBlock',
      text: 'CONFIDENCE',
      size: 'Small',
      weight: 'Bolder',
      isSubtle: true,
      spacing: 'Medium',
    },
    {
      type: 'ColumnSet',
      spacing: 'Small',
      columns: [
        {
          type: 'Column',
          width: `${filled}`,
          style: columnStyle,
          bleed: true,
          items: [{ type: 'TextBlock', text: ' ', size: 'Default', spacing: 'None' }],
        },
        {
          type: 'Column',
          width: `${empty}`,
          style: 'emphasis',
          bleed: true,
          items: [{ type: 'TextBlock', text: ' ', size: 'Default', spacing: 'None' }],
        },
      ],
    },
    {
      type: 'TextBlock',
      text: `${pct}% · ${label}`,
      size: 'Small',
      color: textColor,
      spacing: 'None',
    },
  ];
}

function buildAnswerCard(response) {
  const answer = truncate(stripHtml(response.answer || ''), MAX_ANSWER_CHARS);
  const confidence = clampConfidence(response.confidence);
  const sources = deduplicateSources(response.sources).slice(0, MAX_SOURCES);

  const body = [
    { type: 'TextBlock', text: 'infynk', weight: 'Bolder', color: 'Accent', size: 'Medium', spacing: 'None' },
    { type: 'TextBlock', text: answer || '(No answer returned)', wrap: true, spacing: 'Small' },
    ...buildConfidenceBar(confidence),
  ];

  if (sources.length > 0) {
    body.push({
      type: 'TextBlock',
      text: 'SOURCES',
      size: 'Small',
      weight: 'Bolder',
      isSubtle: true,
      spacing: 'Medium',
    });
    sources.forEach((s) => body.push(buildSourceBlock(s)));
  }

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
    actions: [
      {
        type: 'Action.ShowCard',
        title: 'Ask a follow-up…',
        card: {
          type: 'AdaptiveCard',
          body: [
            {
              type: 'Input.Text',
              id: 'followupQuestion',
              placeholder: 'Type your follow-up question…',
              isMultiline: false,
            },
          ],
          actions: [
            {
              type: 'Action.Submit',
              title: 'Ask',
              data: { type: 'followup' },
            },
          ],
        },
      },
    ],
  };
}

function buildErrorCard(message) {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: 'attention',
        items: [
          { type: 'TextBlock', text: '⚠ Error', weight: 'Bolder', color: 'Attention' },
          { type: 'TextBlock', text: message || 'An unknown error occurred.', wrap: true, size: 'Small' },
        ],
      },
    ],
  };
}

function buildOfflineCard() {
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body: [
      {
        type: 'Container',
        style: 'attention',
        items: [
          { type: 'TextBlock', text: '● infynk backend is offline', weight: 'Bolder', color: 'Attention' },
          {
            type: 'TextBlock',
            text: 'Start it with:\n\nuvicorn backend.app.main:app --reload --port 8000',
            wrap: true,
            size: 'Small',
            spacing: 'Small',
          },
        ],
      },
    ],
  };
}

module.exports = { buildAnswerCard, buildErrorCard, buildOfflineCard };
