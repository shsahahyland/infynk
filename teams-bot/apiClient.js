'use strict';

const BACKEND_URL = process.env.INFYNK_BACKEND_URL || 'http://localhost:8000';

async function post(path, body) {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`infynk API ${response.status} ${response.statusText} at ${path}`);
  }
  return response.json();
}

async function get(path) {
  const response = await fetch(`${BACKEND_URL}${path}`);
  if (!response.ok) {
    throw new Error(`infynk API ${response.status} ${response.statusText} at ${path}`);
  }
  return response.json();
}

function askQuestion(request) {
  return post('/ask', request);
}

function triggerIngest() {
  return post('/ingest', {});
}

function getHealth() {
  return get('/health');
}

function getGraphStats() {
  return get('/graph/stats');
}

module.exports = { askQuestion, triggerIngest, getHealth, getGraphStats };
