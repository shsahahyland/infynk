const API_BASE = import.meta.env.VITE_API_URL ?? "";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok)
    throw new Error(`${options.method ?? "GET"} ${path} → HTTP ${res.status}`);
  return res.json();
}

const post = (path, body) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const fetchTeams = () => request("/teams");
export const fetchGraphData = () => request("/graph");
export const fetchHealth = () =>
  fetch(`${API_BASE}/health`)
    .then((r) => (r.ok ? "ok" : "err"))
    .catch(() => "err");
export const askQuestion = (question, userTeam) =>
  post("/ask", { question, user_team: userTeam });
export const triggerIngest = (team) => post("/ingest", { team });
