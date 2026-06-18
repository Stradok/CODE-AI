import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as cp from "child_process";

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let serverTerminal: vscode.Terminal | undefined;
let analysisInProgress = false;

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("CODE-AI");

  // Status bar button
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = "$(shield) CODE-AI";
  statusBarItem.tooltip = "Analyze current Python file for CVEs";
  statusBarItem.command = "code-ai.analyzeFile";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem, outputChannel);

  // Register commands
  const commands: [string, (...args: unknown[]) => unknown][] = [
    ["code-ai.analyzeFile", () => analyzeFile({ auto: true, pdf: false })],
    [
      "code-ai.analyzeFileInteractive",
      () => analyzeFile({ auto: false, pdf: false }),
    ],
    ["code-ai.analyzeFilePdf", () => analyzeFile({ auto: true, pdf: true })],
    ["code-ai.checkOllama", checkOllama],
    ["code-ai.openResults", openResults],
    ["code-ai.startServer", startServer],
    ["code-ai.stopServer", stopServer],
  ];

  for (const [id, handler] of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, handler)
    );
  }

  // Reset status bar when analysis terminal closes
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((t) => {
      if (t.name === "CODE-AI Pipeline") {
        resetStatusBar();
        analysisInProgress = false;
        // Offer to open results after terminal closes
        offerOpenResults();
      }
      if (t === serverTerminal) {
        serverTerminal = undefined;
      }
    })
  );

  outputChannel.appendLine("CODE-AI extension activated.");
}

export function deactivate(): void {
  outputChannel?.dispose();
}

// ---------------------------------------------------------------------------
// Project root detection
// ---------------------------------------------------------------------------

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("codeAI");
}

function findProjectRoot(): string | undefined {
  // 1. Check user-configured path
  const configured = getConfig().get<string>("projectRoot");
  if (configured && fs.existsSync(path.join(configured, "config.yaml"))) {
    return configured;
  }

  // 2. Search workspace folders for config.yaml
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return undefined;

  for (const folder of folders) {
    const candidate = folder.uri.fsPath;
    if (fs.existsSync(path.join(candidate, "config.yaml"))) {
      return candidate;
    }
    // Check one level deep (handles nested project dirs)
    try {
      for (const entry of fs.readdirSync(candidate, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const nested = path.join(candidate, entry.name);
          if (fs.existsSync(path.join(nested, "config.yaml"))) {
            return nested;
          }
        }
      }
    } catch {
      // ignore read errors
    }
  }

  return undefined;
}

function getUvPath(): string {
  return getConfig().get<string>("uvPath") || "uv";
}

/**
 * Returns extra `uv run` args when `codeAI.pythonVersion` is configured.
 * e.g. ["--python", "3.13"]
 */
function getUvPythonArgs(): string[] {
  const ver = getConfig().get<string>("pythonVersion");
  return ver ? ["--python", ver] : [];
}

/**
 * Builds environment variables for terminal / child-process sessions.
 * Suppresses Pydantic V1 + DeprecationWarning noise on Python ≥ 3.14.
 */
function getPipelineEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (getConfig().get<boolean>("suppressWarnings") !== false) {
    // Filters: Pydantic V1 UserWarning from langchain, generic DeprecationWarning
    env["PYTHONWARNINGS"] =
      "ignore::UserWarning:langchain_core,ignore::DeprecationWarning";
    // Prevents __pycache__ bytecode issues across Python version switches
    env["PYTHONDONTWRITEBYTECODE"] = "1";
  }
  return env;
}

// ---------------------------------------------------------------------------
// Analyze file
// ---------------------------------------------------------------------------

interface AnalyzeOptions {
  auto: boolean;
  pdf: boolean;
}

async function analyzeFile(opts: AnalyzeOptions): Promise<void> {
  if (analysisInProgress) {
    vscode.window.showWarningMessage(
      "An analysis is already running. Wait for it to finish or close its terminal."
    );
    return;
  }

  // Get the file to analyze
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "No active editor. Open a Python file first."
    );
    return;
  }

  const filePath = editor.document.uri.fsPath;
  if (!filePath.endsWith(".py")) {
    vscode.window.showWarningMessage(
      "CODE-AI only analyzes Python (.py) files."
    );
    return;
  }

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage(
      "Could not find CODE-AI project root (config.yaml). " +
        "Set codeAI.projectRoot in settings or open the project folder."
    );
    return;
  }

  // Save file before analysis
  if (editor.document.isDirty) {
    await editor.document.save();
  }

  // Build the command
  const uv = getUvPath();
  const pyArgs = getUvPythonArgs();
  const logLevel = getConfig().get<string>("logLevel") || "INFO";

  // Compute relative path from project root to the file
  let targetPath = filePath;
  if (filePath.startsWith(projectRoot)) {
    targetPath = path.relative(projectRoot, filePath);
  }

  const args = [
    "run",
    ...pyArgs,
    "python",
    "-m",
    "api.cli.main",
    "--code",
    `"${targetPath}"`,
    "--log-level",
    logLevel,
  ];
  if (opts.auto) args.push("--auto");
  if (opts.pdf) args.push("--pdf");

  const command = `${uv} ${args.join(" ")}`;

  // Update status bar
  analysisInProgress = true;
  statusBarItem.text = "$(loading~spin) Analyzing...";
  statusBarItem.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.warningBackground"
  );
  statusBarItem.tooltip = "CODE-AI pipeline is running...";

  // Log to output channel
  outputChannel.appendLine(`\n${"=".repeat(60)}`);
  outputChannel.appendLine(`  CODE-AI Analysis Started`);
  outputChannel.appendLine(`  File   : ${filePath}`);
  outputChannel.appendLine(`  Mode   : ${opts.auto ? "Auto" : "Interactive"}`);
  outputChannel.appendLine(`  PDF    : ${opts.pdf ? "Yes" : "No"}`);
  outputChannel.appendLine(`  Root   : ${projectRoot}`);
  outputChannel.appendLine(`${"=".repeat(60)}\n`);
  outputChannel.appendLine(`> ${command}\n`);

  // Run in integrated terminal (user sees live colorful output)
  const terminal = vscode.window.createTerminal({
    name: "CODE-AI Pipeline",
    cwd: projectRoot,
    iconPath: new vscode.ThemeIcon("shield"),
    env: getPipelineEnv(),
  });
  terminal.show();
  terminal.sendText(command);

  vscode.window.showInformationMessage(
    `CODE-AI: Analyzing ${path.basename(filePath)}...`
  );
}

// ---------------------------------------------------------------------------
// Check Ollama
// ---------------------------------------------------------------------------

async function checkOllama(): Promise<void> {
  const projectRoot = findProjectRoot();

  outputChannel.show();
  outputChannel.appendLine("\nChecking Ollama status...");

  // Try direct ollama check first
  try {
    cp.execSync("ollama list", {
      encoding: "utf-8",
      timeout: 10000,
      stdio: "pipe",
    });
    const models = cp
      .execSync("ollama list", {
        encoding: "utf-8",
        timeout: 10000,
        stdio: "pipe",
      })
      .trim();

    outputChannel.appendLine("Ollama is running. Available models:");
    outputChannel.appendLine(models);

    const msg = await vscode.window.showInformationMessage(
      "✅ Ollama is running and reachable.",
      "Show Models"
    );
    if (msg === "Show Models") {
      outputChannel.show();
    }
    return;
  } catch {
    // Fall through — try via Python
  }

  if (projectRoot) {
    try {
      const uv = getUvPath();
      const pyArgs = getUvPythonArgs().join(" ");
      const pyArgsPart = pyArgs ? ` ${pyArgs}` : "";
      const result = cp.execSync(
        `${uv} run${pyArgsPart} python -c "from pipeline.llm.ollama_client import check_ollama; print(check_ollama())"`,
        {
          cwd: projectRoot,
          encoding: "utf-8",
          timeout: 15000,
          stdio: "pipe",
          env: { ...process.env, ...getPipelineEnv() },
        }
      );

      if (result.trim().includes("True")) {
        vscode.window.showInformationMessage(
          "✅ Ollama is running and reachable."
        );
        outputChannel.appendLine("Ollama: OK (checked via pipeline)");
      } else {
        vscode.window.showWarningMessage(
          '⚠️ Ollama is not reachable. Run "ollama serve" first.'
        );
        outputChannel.appendLine("Ollama: NOT REACHABLE");
      }
      return;
    } catch {
      // Fall through
    }
  }

  vscode.window.showErrorMessage(
    '❌ Cannot reach Ollama. Make sure it\'s running with "ollama serve".'
  );
  outputChannel.appendLine("Ollama: FAILED — not reachable via any method");
}

// ---------------------------------------------------------------------------
// Open results
// ---------------------------------------------------------------------------

async function openResults(): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage("Could not find CODE-AI project root.");
    return;
  }

  const resultsPath = path.join(
    projectRoot,
    "output",
    "pipeline_results.json"
  );

  if (!fs.existsSync(resultsPath)) {
    vscode.window.showWarningMessage(
      "No results file found. Run an analysis first."
    );
    return;
  }

  const doc = await vscode.workspace.openTextDocument(resultsPath);
  await vscode.window.showTextDocument(doc, { preview: false });
}

async function offerOpenResults(): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) return;

  const resultsPath = path.join(
    projectRoot,
    "output",
    "pipeline_results.json"
  );
  if (!fs.existsSync(resultsPath)) return;

  const action = await vscode.window.showInformationMessage(
    "CODE-AI analysis finished.",
    "Open Results",
    "Dismiss"
  );
  if (action === "Open Results") {
    await openResults();
  }
}

// ---------------------------------------------------------------------------
// API Server management
// ---------------------------------------------------------------------------

async function startServer(): Promise<void> {
  if (serverTerminal) {
    vscode.window.showWarningMessage(
      "API server is already running. Stop it first."
    );
    serverTerminal.show();
    return;
  }

  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    vscode.window.showErrorMessage("Could not find CODE-AI project root.");
    return;
  }

  const uv = getUvPath();
  const pyArgs = getUvPythonArgs();
  const port = getConfig().get<number>("serverPort") || 8000;
  const args = [
    "run",
    ...pyArgs,
    "uvicorn",
    "api.server:app",
    "--host",
    "0.0.0.0",
    "--port",
    String(port),
    "--reload",
  ];
  const command = `${uv} ${args.join(" ")}`;

  serverTerminal = vscode.window.createTerminal({
    name: "CODE-AI Server",
    cwd: projectRoot,
    iconPath: new vscode.ThemeIcon("server"),
    env: getPipelineEnv(),
  });
  serverTerminal.show();
  serverTerminal.sendText(command);

  vscode.window.showInformationMessage(
    `CODE-AI API server starting on port ${port}...`
  );
  outputChannel.appendLine(`\nAPI server started: http://localhost:${port}`);
}

async function stopServer(): Promise<void> {
  if (!serverTerminal) {
    vscode.window.showInformationMessage("No API server is running.");
    return;
  }

  serverTerminal.dispose();
  serverTerminal = undefined;
  vscode.window.showInformationMessage("CODE-AI API server stopped.");
  outputChannel.appendLine("API server stopped.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetStatusBar(): void {
  statusBarItem.text = "$(shield) CODE-AI";
  statusBarItem.backgroundColor = undefined;
  statusBarItem.tooltip = "Analyze current Python file for CVEs";
}
