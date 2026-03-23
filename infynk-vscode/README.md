# infynk — AI Knowledge System

VS Code extension that connects to the infynk FastAPI backend to let you query your organisation's knowledge graph (GitHub, Confluence, Jira, HylandDocs) without leaving the editor.

## Requirements

- The infynk backend running locally at `http://localhost:8000` (default)
- VS Code 1.85+

## Features

| Feature | Details |
|---|---|
| **Sidebar chat** | Activity bar panel with team selector, message history, source cards, and confidence bar |
| **Context menu** | Right-click selected text → *Ask infynk about this* |
| **Command palette** | `infynk: Ask a Question`, `infynk: Re-ingest Sources`, `infynk: Show Graph Stats`, `infynk: Set Active Team` |
| **Status bar** | Shows `infynk ● TeamName` — green = backend online, red = offline |
| **Health polling** | Checks `/health` every 30 seconds |

## Getting started

### 1. Start the backend

```bash
cd /path/to/infynk
uvicorn backend.app.main:app --reload --port 8000
```

### 2. Install extension dependencies and compile

```bash
cd infynk-vscode
npm install
npm run compile
```

### 3. Launch in VS Code

Press **F5** in the `infynk-vscode` folder to launch an Extension Development Host, or package and install the `.vsix` file with:

```bash
npm run package   # requires vsce: npm i -g @vscode/vsce
```

## Extension settings

| Setting | Default | Description |
|---|---|---|
| `infynk.backendUrl` | `http://localhost:8000` | Base URL of the infynk backend |
| `infynk.defaultTeam` | `Automate` | Team selected on first open |
| `infynk.autoIngestOnStartup` | `false` | Automatically trigger ingestion when VS Code starts |

## Development

```bash
npm run compile        # one-off TypeScript compile
npm run watch          # watch mode
npm run lint           # eslint (if configured)
```

Source layout:

```
src/
  extension.ts        — activate / deactivate
  sidebarProvider.ts  — WebviewViewProvider + health polling + status bar
  commands.ts         — command handlers
  apiClient.ts        — fetch wrappers for all backend endpoints
  webview/
    panel.html        — self-contained webview UI (inline CSS + JS)
images/
  icon.svg
```

## License

MIT
