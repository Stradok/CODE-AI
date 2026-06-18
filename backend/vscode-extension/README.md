# CODE-AI VS Code Extension

Run the CODE-AI CVE detection & remediation pipeline directly from VS Code.

## Features

| Feature | Description |
|---------|-------------|
| **Analyze File** | Run the full 6-stage pipeline on the active `.py` file |
| **Interactive Mode** | Analyze with manual retry/skip/GPT-escalate prompts |
| **PDF Report** | Generate a PDF alongside the JSON report |
| **Ollama Check** | Verify Ollama is running before analysis |
| **API Server** | Start/stop the FastAPI server from VS Code |
| **Results Viewer** | Open pipeline results after analysis completes |

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and type `CODE-AI`:

| Command | Shortcut | Description |
|---------|----------|-------------|
| `CODE-AI: Analyze Current File for CVEs` | `Ctrl+Shift+A` | Run pipeline in auto mode |
| `CODE-AI: Analyze Current File (Interactive)` | — | Run with interactive prompts |
| `CODE-AI: Analyze Current File + PDF Report` | — | Auto mode + PDF generation |
| `CODE-AI: Check Ollama Status` | — | Verify Ollama connectivity |
| `CODE-AI: Open Pipeline Results` | — | Open the results JSON |
| `CODE-AI: Start API Server` | — | Launch FastAPI on configured port |
| `CODE-AI: Stop API Server` | — | Terminate the server |

## Quick Access

- **Status bar**: Click the `$(shield) CODE-AI` button in the bottom-left
- **Editor title**: Shield icon appears in the title bar for `.py` files
- **Right-click menu**: Context menu entries on `.py` files in editor and explorer

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `codeAI.projectRoot` | `""` (auto-detect) | Path to the CODE-AI project root |
| `codeAI.uvPath` | `"uv"` | Path to the `uv` executable |
| `codeAI.autoMode` | `true` | Default to auto mode |
| `codeAI.logLevel` | `"INFO"` | Pipeline log level |
| `codeAI.serverPort` | `8000` | FastAPI server port |

## Prerequisites

1. **Ollama** must be running (`ollama serve`)
2. **uv** must be installed and on `PATH`
3. Required Ollama models must be pulled (see main project README)
4. Project dependencies must be synced (`uv sync`)

## Development

```bash
cd vscode-extension
npm install
npm run compile    # Build once
npm run watch      # Watch mode
```

Press `F5` in VS Code to launch the Extension Development Host for testing.

## Packaging

```bash
npm install -g @vscode/vsce
cd vscode-extension
vsce package       # Creates code-ai-cve-detector-0.1.0.vsix
```

Install the `.vsix` via: Extensions → `...` menu → "Install from VSIX..."
