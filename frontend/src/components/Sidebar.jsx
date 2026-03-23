import { useState, useEffect } from "react";
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { fetchHealth, triggerIngest } from "../api";

// Source pill colour mapping
const SOURCE_COLORS = {
  github: "text-accent border-accent/30 bg-accent/10",
  confluence: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  jira: "text-warn border-warn/30 bg-warn/10",
};

function sourcePillClass(src) {
  const key = src.split(":")[0];
  return (
    SOURCE_COLORS[key] ?? "text-slate-400 border-slate-400/30 bg-slate-400/10"
  );
}

function sourceLabel(src) {
  const [type, name] = src.split(":");
  const prefix =
    { github: "GH", confluence: "CF", jira: "JR" }[type] ?? type.toUpperCase();
  return `${prefix} ${name}`;
}

export default function Sidebar({
  teams,
  activeTeam,
  onSelectTeam,
  ingestStatus,
  setIngestStatus,
}) {
  const [health, setHealth] = useState(null); // null | 'ok' | 'err'

  useEffect(() => {
    const check = () => fetchHealth().then(setHealth);
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  const handleIngest = async (e, team) => {
    e.stopPropagation();
    const teamName = team.name;
    setIngestStatus((s) => ({ ...s, [teamName]: { state: "loading" } }));

    if (team.mock) {
      setTimeout(() => {
        setIngestStatus((s) => ({
          ...s,
          [teamName]: { state: "ok", docs: "demo" },
        }));
      }, 600);
      return;
    }

    try {
      const data = await triggerIngest(teamName);
      setIngestStatus((s) => ({
        ...s,
        [teamName]: { state: "ok", docs: data.documents_ingested ?? "?" },
      }));
    } catch {
      setIngestStatus((s) => ({ ...s, [teamName]: { state: "err" } }));
    }
  };

  return (
    <aside
      className="flex flex-col shrink-0 bg-sidebar border-r border-border overflow-y-auto"
      style={{ width: 220 }}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <img src="/logo.svg" alt="infynk" className="h-7 w-auto" />
        <p className="mt-1 font-mono text-[10px] text-slate-600 uppercase tracking-widest">
          knowledge system
        </p>
      </div>

      {/* Team list */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        <p className="px-3 mb-2 font-mono text-[10px] text-slate-600 uppercase tracking-widest">
          Teams
        </p>
        {teams.map((team) => {
          const isActive = team.name === activeTeam;
          const status = ingestStatus[team.name];

          return (
            <div key={team.name}>
              <button
                onClick={() => onSelectTeam(team.name)}
                className={`w-full text-left px-3 py-2 rounded transition-colors text-sm font-medium border-l-2 ${
                  isActive
                    ? "border-accent text-white bg-accent/10"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-surface"
                }`}
              >
                {team.name}
              </button>

              {/* Source pills + ingest — shown for active team */}
              {isActive && (
                <div className="px-3 pb-2 space-y-2 animate-fade-in">
                  {/* Source pills */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {team.sources.map((src) => (
                      <span
                        key={src}
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${sourcePillClass(src)}`}
                      >
                        {sourceLabel(src)}
                      </span>
                    ))}
                  </div>

                  {/* Ingest button */}
                  <IngestButton
                    team={team}
                    status={status}
                    onIngest={handleIngest}
                  />
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Health indicator */}
      <div className="px-5 py-3 border-t border-border flex items-center gap-2">
        {health === "ok" ? (
          <>
            <Wifi size={12} className="text-teal" />
            <span className="font-mono text-[10px] text-teal">
              backend online
            </span>
            <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-teal pulse-live" />
          </>
        ) : health === "err" ? (
          <>
            <WifiOff size={12} className="text-danger" />
            <span className="font-mono text-[10px] text-danger">
              backend offline
            </span>
            <span className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-danger" />
          </>
        ) : (
          <>
            <Loader2 size={12} className="text-slate-600 animate-spin" />
            <span className="font-mono text-[10px] text-slate-600">
              checking...
            </span>
          </>
        )}
      </div>
    </aside>
  );
}

function IngestButton({ team, status, onIngest }) {
  const teamName = team.name;
  const isMock = team.mock ?? false;
  const isLoading = status?.state === "loading";
  const isOk = status?.state === "ok";
  const isErr = status?.state === "err";

  if (isOk) {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[10px] text-teal">
        <CheckCircle2 size={11} />
        Ready — {status.docs} docs
      </div>
    );
  }

  if (isErr) {
    return (
      <button
        onClick={(e) => onIngest(e, team)}
        className="flex items-center gap-1.5 font-mono text-[10px] text-danger hover:text-danger/80 transition-colors"
      >
        <AlertCircle size={11} />
        Failed — retry
      </button>
    );
  }

  return (
    <button
      disabled={isLoading}
      onClick={(e) => onIngest(e, team)}
      className={`flex items-center gap-1.5 font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
        isLoading
          ? "border-border text-slate-600 cursor-not-allowed"
          : isMock
            ? "border-slate-600/40 text-slate-500 hover:bg-surface"
            : "border-accent/40 text-accent hover:bg-accent/10"
      }`}
    >
      {isLoading ? (
        <>
          <Loader2 size={11} className="animate-spin" />
          {isMock ? "Loading..." : "Ingesting..."}
        </>
      ) : (
        <>
          <Download size={11} />
          {isMock ? `Load ${teamName} demo` : `Ingest ${teamName}`}
        </>
      )}
    </button>
  );
}
