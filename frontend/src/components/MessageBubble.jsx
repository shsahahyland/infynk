import ReactMarkdown from "react-markdown";
import SourceCard from "./SourceCard";
import ConfidenceBar from "./ConfidenceBar";

export default function MessageBubble({ message }) {
  const { role, text, sources, confidence } = message;

  if (role === "user") {
    return (
      <div className="mb-4 flex justify-end">
        <div className="max-w-[70%] rounded-2xl rounded-tr-md bg-electric px-4 py-3 text-sm text-white shadow-sm">
          {text}
        </div>
      </div>
    );
  }

  if (role === "system") {
    return (
      <div className="mb-4 flex justify-center">
        <div className="rounded-full bg-slate-100 px-4 py-1.5 text-xs text-slate-500">
          <ReactMarkdown
            components={{
              p: ({ children }) => <span>{children}</span>,
              strong: ({ children }) => (
                <strong className="font-semibold text-slate-700">
                  {children}
                </strong>
              ),
            }}
          >
            {text}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric text-sm text-white">
        🧠
      </div>
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-tl-md bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              code: ({ children }) => (
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono text-pink-600">
                  {children}
                </code>
              ),
              ul: ({ children }) => (
                <ul className="mb-2 list-disc pl-4">{children}</ul>
              ),
              li: ({ children }) => <li className="mb-0.5">{children}</li>,
            }}
          >
            {text}
          </ReactMarkdown>
        </div>

        {/* Confidence bar */}
        {confidence !== undefined && (
          <div className="mt-2">
            <ConfidenceBar confidence={confidence} />
          </div>
        )}

        {/* Source cards */}
        {sources && sources.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Sources
            </p>
            {sources.map((src, i) => (
              <SourceCard key={i} source={src} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
