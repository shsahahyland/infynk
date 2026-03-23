import { ExternalLink } from "lucide-react";

const SOURCE_CFG = {
  github: {
    badge: "GH",
    color: "#4f8cff",
    bg: "rgba(79,140,255,0.1)",
    border: "rgba(79,140,255,0.25)",
  },
  confluence: {
    badge: "CF",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.1)",
    border: "rgba(167,139,250,0.25)",
  },
  jira: {
    badge: "JR",
    color: "#ffb347",
    bg: "rgba(255,179,71,0.1)",
    border: "rgba(255,179,71,0.25)",
  },
  hyland_docs: {
    badge: "HD",
    color: "#f97316",
    bg: "rgba(249,115,22,0.1)",
    border: "rgba(249,115,22,0.25)",
  },
};

const CONTENT_HEADER_RE = /^\[(Repository|File|Owners|Page|Space):[^\]]*\]\s*/g;

function stripContentHeaders(raw) {
  return (raw ?? "").replace(CONTENT_HEADER_RE, "").trim();
}

function getSourceMeta(source) {
  const m = source.metadata ?? {};
  const fallback = source.document_id ?? "Unknown";
  switch (source.source) {
    case "github":
      return {
        title: m.file ?? fallback,
        subtitle: m.org && m.repo ? `${m.org}/${m.repo}` : (m.repo ?? null),
      };
    case "confluence":
      return {
        title: m.title ?? fallback,
        subtitle: m.space ? `Space: ${m.space}` : null,
      };
    case "jira":
      return {
        title: m.summary ?? m.key ?? fallback,
        subtitle:
          m.key && m.status ? `${m.key} · ${m.status}` : (m.key ?? null),
      };
    case "hyland_docs":
      return {
        title: m.title ?? fallback,
        subtitle: m.product ? `${m.product} docs` : "Hyland Support",
      };
    default:
      return {
        title: m.file ?? m.title ?? m.summary ?? m.key ?? fallback,
        subtitle: null,
      };
  }
}

export default function SourceCard({ source }) {
  const cfg = SOURCE_CFG[source.source] ?? SOURCE_CFG.github;
  const url = source.metadata?.url;
  const { title, subtitle } = getSourceMeta(source);

  const cleaned = stripContentHeaders(source.snippet ?? source.content ?? "");
  const snippet =
    cleaned.length > 120 ? cleaned.slice(0, 120) + "…" : cleaned || null;

  return (
    <div
      className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-white/[0.02] group"
      style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}
    >
      <span
        className="shrink-0 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5"
        style={{
          color: cfg.color,
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
        }}
      >
        {cfg.badge}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-slate-300 font-mono">
            {title}
          </span>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-accent"
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
        {subtitle && (
          <span className="font-mono text-[10px] text-slate-600">
            {subtitle}
          </span>
        )}
        {snippet && (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            {snippet}
          </p>
        )}
      </div>
    </div>
  );
}
