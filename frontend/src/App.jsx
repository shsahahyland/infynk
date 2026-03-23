import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import InputBar from "./components/InputBar";
import GraphView from "./components/GraphView";
import { fetchTeams, askQuestion } from "./api";
import { MessageSquare, GitBranch } from "lucide-react";

const FALLBACK_TEAMS = [{ name: "Automate", sources: [], mock: false }];
const BACKEND_ERROR = "Failed to reach infynk backend. Is the server running?";

export default function App() {
  const [teams, setTeams] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTeam, setActiveTeam] = useState(null);
  const [ingestStatus, setIngestStatus] = useState({});
  const [tab, setTab] = useState("ask");
  const [graphFetched, setGraphFetched] = useState(false);

  useEffect(() => {
    fetchTeams()
      .then((data) => {
        setTeams(data);
        if (data.length > 0) setActiveTeam(data[0].name);
      })
      .catch(() => {
        setTeams(FALLBACK_TEAMS);
        setActiveTeam(FALLBACK_TEAMS[0].name);
      });
  }, []);

  const handleSend = async (question) => {
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setLoading(true);
    try {
      const data = await askQuestion(question, activeTeam ?? undefined);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.answer,
          sources: data.sources ?? [],
          confidence: data.confidence ?? 0,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: BACKEND_ERROR,
          sources: [],
          confidence: 0,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === "graph") setGraphFetched(true);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg bg-grid font-sans">
      <Sidebar
        teams={teams}
        activeTeam={activeTeam}
        onSelectTeam={setActiveTeam}
        ingestStatus={ingestStatus}
        setIngestStatus={setIngestStatus}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-0 border-b border-border bg-sidebar px-3 shrink-0">
          <TabBtn
            active={tab === "ask"}
            onClick={() => handleTabChange("ask")}
            icon={<MessageSquare size={14} />}
            label="Ask"
          />
          <TabBtn
            active={tab === "graph"}
            onClick={() => handleTabChange("graph")}
            icon={<GitBranch size={14} />}
            label="Knowledge Graph"
          />
          <div className="ml-auto font-mono text-xs text-slate-600 pr-2 hidden sm:block">
            infynk / {activeTeam ?? "—"}
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          {tab === "ask" ? (
            <>
              <ChatWindow
                messages={messages}
                loading={loading}
                activeTeam={activeTeam}
              />
              <InputBar
                onSend={handleSend}
                disabled={loading}
                activeTeam={activeTeam}
              />
            </>
          ) : (
            <GraphView shouldFetch={graphFetched} />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium font-mono transition-colors border-b-2 ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-slate-500 hover:text-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
