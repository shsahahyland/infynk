import { GitBranch, BookOpen, Ticket, Loader2 } from "lucide-react";

function sourceIcon(src) {
  if (src.startsWith("github:"))
    return <GitBranch size={14} className="text-blue-400" />;
  if (src.startsWith("confluence:"))
    return <BookOpen size={14} className="text-purple-400" />;
  if (src.startsWith("jira:"))
    return <Ticket size={14} className="text-orange-400" />;
  return null;
}

export default function TeamSidebar({
  teams,
  activeTeam,
  onSelectTeam,
  ingesting,
}) {
  return (
    <aside className="flex w-64 flex-col bg-navy text-white">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="text-2xl">🧠</span>
        <div>
          <h1 className="text-lg font-bold tracking-tight">infynk</h1>
          <p className="text-xs text-slate-400">AI Knowledge System</p>
        </div>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Teams
        </p>
      </div>

      {/* Team list */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {teams.map((team) => {
          const isActive = activeTeam === team.name;
          return (
            <button
              key={team.name}
              onClick={() => onSelectTeam(team)}
              disabled={ingesting}
              className={`group flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? "bg-electric/20 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {ingesting && isActive ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                {team.name}
              </span>
              <span className="mt-1 flex flex-wrap gap-1.5">
                {team.sources.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1 rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-400"
                  >
                    {sourceIcon(s)}
                    {s.split(":")[1]}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700/50 px-5 py-3">
        <p className="text-[10px] text-slate-600">v0.1.0 · Hackathon MVP</p>
      </div>
    </aside>
  );
}
