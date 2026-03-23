import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

const MAX_TEXTAREA_HEIGHT = 120;

export default function InputBar({ onSend, disabled, activeTeam }) {
  const [text, setText] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT) + "px";
  }, [text]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const placeholder = activeTeam
    ? `Ask about the ${activeTeam} codebase...`
    : "Ask about your codebase...";

  return (
    <div className="shrink-0 border-t border-border bg-sidebar px-4 py-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-slate-500">Team:</span>
        {activeTeam ? (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-accent/30 bg-accent/10 text-accent">
            {activeTeam}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-slate-600 italic">
            No team selected
          </span>
        )}
      </div>
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none transition-all focus:border-accent/50 focus:ring-1 focus:ring-accent/20 disabled:opacity-40 leading-relaxed font-sans overflow-hidden"
          style={{ minHeight: 42 }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white transition-all hover:bg-accent/80 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={16} />
        </button>
      </div>
      <p className="mt-1.5 font-mono text-[10px] text-slate-700 text-right">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
