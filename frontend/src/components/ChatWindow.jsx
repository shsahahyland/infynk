import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import ConfidenceBar from "./ConfidenceBar";
import SourceCard from "./SourceCard";

// Strip mock-mode footer appended by _mock_answer()
function stripMockText(text) {
  return (text ?? "").replace(/\(Set GROQ_API_KEY[^)]*\)/g, "").trim();
}

// Deduplicate sources by a per-type stable key
function dedupSources(sources) {
  const seen = new Set();
  return (sources ?? []).filter((src) => {
    const m = src.metadata ?? {};
    let key;
    if (src.source === "github") key = `gh:${m.repo ?? ""}:${m.file ?? src.id}`;
    else if (src.source === "confluence")
      key = `cf:${m.space ?? ""}:${m.title ?? src.id}`;
    else if (src.source === "jira") key = `jr:${m.key ?? src.id}`;
    else key = src.id ?? JSON.stringify(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function ChatWindow({ messages, loading, activeTeam }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
      {messages.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center h-full text-center select-none">
          <p className="text-2xl font-medium text-slate-600">
            Ask anything about{" "}
            <span className="text-accent">{activeTeam ?? "your codebase"}</span>
          </p>
          <p className="mt-2 text-slate-700 text-sm font-mono flex items-center gap-2">
            Type below and press Enter
            <AnimatedArrow />
          </p>
        </div>
      )}

      {messages.map((msg, i) => (
        <div
          key={i}
          className={`flex animate-fade-in ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          {msg.role === "user" ? (
            <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-accent/20 border border-accent/30 px-4 py-2.5 text-sm text-slate-200">
              {msg.text}
            </div>
          ) : (
            <div
              className={`max-w-[80%] rounded-2xl rounded-tl-sm bg-surface border px-5 py-4 space-y-3 ${
                msg.isError ? "border-danger/40" : "border-border"
              }`}
            >
              <div className="prose-dark">
                <ReactMarkdown>{stripMockText(msg.text)}</ReactMarkdown>
              </div>
              {!msg.isError && typeof msg.confidence === "number" && (
                <ConfidenceBar value={msg.confidence} />
              )}
              {!msg.isError && msg.sources && msg.sources.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
                    Sources
                  </p>
                  {dedupSources(msg.sources).map((src, j) => (
                    <SourceCard key={j} source={src} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {loading && (
        <div className="flex justify-start animate-fade-in">
          <div className="bg-surface border border-border rounded-2xl rounded-tl-sm px-5 py-4">
            <div className="flex gap-1.5 items-center h-4">
              <span className="typing-dot w-2 h-2 rounded-full bg-accent/60 inline-block" />
              <span className="typing-dot w-2 h-2 rounded-full bg-accent/60 inline-block" />
              <span className="typing-dot w-2 h-2 rounded-full bg-accent/60 inline-block" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function AnimatedArrow() {
  return (
    <span
      className="inline-block"
      style={{ animation: "arrowBounce 1.2s ease-in-out infinite" }}
    >
      <style>{`
        @keyframes arrowBounce {
          0%, 100% { transform: translateX(0); opacity: 0.5; }
          50%       { transform: translateX(5px); opacity: 1; }
        }
      `}</style>
      →
    </span>
  );
}
