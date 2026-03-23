import * as vscode from 'vscode';

export interface AskRequest {
  question: string;
  user_team?: string;
}

export interface SourceReference {
  document_id: string;
  source: string;
  snippet: string;
  metadata: Record<string, unknown>;
}

export interface AskResponse {
  answer: string;
  sources: SourceReference[];
  confidence: number;
}

export interface IngestResponse {
  status: string;
  documents_ingested: number;
  graph_nodes: number;
  graph_edges: number;
}

export interface HealthResponse {
  status: string;
}

export interface GraphStatsResponse {
  nodes: number;
  edges: number;
}

function getBaseUrl(): string {
  return vscode.workspace
    .getConfiguration('infynk')
    .get<string>('backendUrl', 'http://localhost:8000');
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`infynk API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${getBaseUrl()}${path}`);
  if (!response.ok) {
    throw new Error(`infynk API error ${response.status}: ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function askQuestion(request: AskRequest): Promise<AskResponse> {
  return post<AskResponse>('/ask', request);
}

export function triggerIngest(): Promise<IngestResponse> {
  return post<IngestResponse>('/ingest', {});
}

export function getHealth(): Promise<HealthResponse> {
  return get<HealthResponse>('/health');
}

export function getGraphStats(): Promise<GraphStatsResponse> {
  return get<GraphStatsResponse>('/graph/stats');
}
