# SSE Event Specification

This document is the authoritative reference for the Server-Sent Events (SSE) stream emitted by `POST /analyze/{job_id}`. Both the backend (`api/server.py`) and any frontend consumer must stay in sync with this spec.

---

## Transport

| Property | Value |
|----------|-------|
| Endpoint | `POST /analyze/{job_id}` |
| Content-Type | `text/event-stream` |
| Cache-Control | `no-cache` |
| Connection | `keep-alive` |
| X-Accel-Buffering | `no` (disables nginx buffering) |

### Wire format

Each event follows the [SSE standard](https://html.spec.whatwg.org/multipage/server-sent-events.html):

```
event: <event_name>
data: <JSON object>

```

A blank line (`\n\n`) terminates each event. The server also emits **SSE comments** as keepalive heartbeats:

```
: heartbeat

```

Lines starting with `:` are ignored by compliant SSE parsers and keep intermediate proxies from closing idle connections. The heartbeat interval is **15 seconds**.

---

## Request body

```jsonc
{
  "code": "...",   // Optional. Current editor content. Falls back to uploaded file when omitted.
  "pdf": false     // Optional. Set true to also generate a PDF report.
}
```

---

## Event catalogue

Events are emitted in the order shown below. All `data` payloads are JSON objects.

### 1. `connected`

Emitted immediately when the stream opens.

```json
{ "job_id": "a1b2c3d4..." }
```

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | `string` | The job identifier (matches the URL parameter) |

---

### 2. `stage_start`

Emitted when a pipeline stage begins. Fires once per stage, per function (except preprocessing which fires once globally).

```json
{ "stage": "preprocessing" }
```

| Field | Type | Description |
|-------|------|-------------|
| `stage` | `string` | One of: `preprocessing`, `rag_analysis`, `validation`, `risk_scoring`, `remediation`, `reporting` |

---

### 3. `description_generated`

Emitted once per function during preprocessing, as soon as the LLM generates its technical description. Allows frontends to show progress and descriptions incrementally rather than waiting for all functions to finish.

```json
{ "function": "run_command", "description": "This function executes a shell command..." }
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |
| `description` | `string` | LLM-generated technical description of the function |

---

### 4. `preprocessing_complete`

Emitted once after AST parsing and LLM description generation finishes for all functions.

```json
{ "functions": ["run_command", "process_input", "handle_request"] }
```

| Field | Type | Description |
|-------|------|-------------|
| `functions` | `string[]` | Names of all functions extracted from the source code |

---

### 5. `function_start`

Emitted at the beginning of each function's analysis loop.

```json
{ "function": "run_command", "index": 0, "total": 3 }
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |
| `index` | `integer` | Zero-based index in the function list |
| `total` | `integer` | Total number of functions being analysed |

---

### 6. `rag_complete`

Emitted after the RAG CVE detection stage finishes for a function.

```json
{ "function": "run_command", "detected_cves": ["CVE-2021-3177", "CVE-2019-9740"] }
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |
| `detected_cves` | `string[]` | CVE IDs flagged by RAG (may include false positives) |

---

### 7. `validation_complete`

Emitted after the independent LLM cross-validation stage.

```json
{ "function": "run_command", "confirmed_count": 1 }
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |
| `confirmed_count` | `integer` | Number of vulnerabilities that survived validation |

---

### 8. `risk_complete`

Emitted after the rule-based risk scoring stage.

```json
{
  "function": "run_command",
  "summary": { "Critical": 0, "High": 1, "Medium": 0, "Low": 0 }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |
| `summary` | `object` | Counts of vulnerabilities at each priority level |
| `summary.Critical` | `integer` | Count of critical-priority vulnerabilities |
| `summary.High` | `integer` | Count of high-priority vulnerabilities |
| `summary.Medium` | `integer` | Count of medium-priority vulnerabilities |
| `summary.Low` | `integer` | Count of low-priority vulnerabilities |

---

### 9. `function_clean`

Emitted when a function has **no confirmed vulnerabilities** after risk scoring. Remediation and reporting are skipped for this function.

```json
{ "function": "process_input" }
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |

---

### 10. `fix_attempt`

Emitted at the start of each remediation attempt. May fire multiple times per function (up to `max_remediation_attempts` from `config.yaml`, default 3).

```json
{ "function": "run_command", "attempt": 1, "max": 3 }
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |
| `attempt` | `integer` | Current attempt number (1-based) |
| `max` | `integer` | Maximum allowed attempts |

---

### 11. `fix_result`

Emitted after each remediation attempt with the verification verdict.

```json
{ "function": "run_command", "verdict": "FIX_SUCCESSFUL", "remaining": 0 }
```

| Field | Type | Description |
|-------|------|-------------|
| `function` | `string` | Function name |
| `verdict` | `string` | One of: `FIX_SUCCESSFUL`, `PARTIALLY_FIXED`, `FIX_FAILED` |
| `remaining` | `integer` | Number of vulnerabilities still present after the fix |

#### Verdict definitions

| Verdict | Meaning |
|---------|---------|
| `FIX_SUCCESSFUL` | All confirmed vulnerabilities resolved. No further attempts needed. |
| `PARTIALLY_FIXED` | Some vulnerabilities resolved but others remain. May trigger a retry. |
| `FIX_FAILED` | The fix did not resolve any vulnerabilities, or introduced new issues. |

---

### 12. `report_written`

Emitted after the JSON report entry is generated for a function. Contains the full result payload used by the frontend to render vulnerability cards.

```json
{
  "function": "run_command",
  "result": {
    "function_name": "run_command",
    "vulnerabilities": [
      {
        "cve_id": "CVE-2021-3177",
        "vulnerability": "Command Injection",
        "exploitability": "High",
        "original_code": "def run_command(user_input): ...",
        "fixed_code": "def run_command(user_input): ...",
        "diff": "--- original\n+++ fixed\n@@ ...",
        "verdict": "FIX_SUCCESSFUL"
      }
    ],
    "audit_trail": "The function was vulnerable to command injection via..."
  }
}
```

#### `result` object

| Field | Type | Description |
|-------|------|-------------|
| `function_name` | `string` | Function name |
| `vulnerabilities` | `Vulnerability[]` | Array of vulnerability entries (see below) |
| `audit_trail` | `string` | LLM-generated explanation of the fix |

#### `Vulnerability` object

| Field | Type | Description |
|-------|------|-------------|
| `cve_id` | `string` | Comma-separated CVE IDs (e.g. `"CVE-2021-3177, CVE-2019-9740"`) |
| `vulnerability` | `string` | Human-readable vulnerability name (e.g. `"Command Injection"`) |
| `exploitability` | `string` | One of: `Critical`, `High`, `Medium`, `Low` |
| `original_code` | `string` | The original function source code |
| `fixed_code` | `string` | The remediated function source code |
| `diff` | `string` | Unified diff between original and fixed code |
| `verdict` | `string` | One of: `FIX_SUCCESSFUL`, `PARTIALLY_FIXED`, `FIX_FAILED` |

---

### 13. `pdf_generated`

Emitted only when `pdf: true` was set in the request body.

```json
{ "path": "output/a1b2c3d4/pipeline_report.pdf" }
```

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Logical path to the generated PDF in the file store |

---

### 14. `pipeline_complete`

Terminal event. Always the last event in a successful stream.

```json
{ "functions_analysed": 3, "functions_fixed": 2 }
```

| Field | Type | Description |
|-------|------|-------------|
| `functions_analysed` | `integer` | Total number of functions processed |
| `functions_fixed` | `integer` | Number of functions that had vulnerabilities and received fixes |

---

### 15. `error`

Emitted when an error occurs. There are two scopes:

#### Pipeline-level error (terminal)

The entire pipeline stops. No `pipeline_complete` follows.

```json
{ "message": "Ollama is not reachable", "stage": "preprocessing" }
```

| Field | Type | Description |
|-------|------|-------------|
| `message` | `string` | Human-readable error description |
| `stage` | `string` | Stage that failed (e.g. `preprocessing`, `pipeline`) |

#### Function-level error (non-terminal)

The current function is skipped, but the pipeline continues with the next function.

```json
{ "message": "LLM timeout after 300s", "stage": "rag_analyzer", "function": "run_command" }
```

| Field | Type | Description |
|-------|------|-------------|
| `message` | `string` | Human-readable error description |
| `stage` | `string` | Stage that failed |
| `function` | `string` | **Present only for function-level errors.** The function that was being processed. |

**Discriminator:** If the `function` field is present, the error is non-terminal. If absent, the error is terminal.

---

## Event flow diagram

### Happy path (all functions have vulnerabilities)

```
connected
stage_start { stage: "preprocessing" }
description_generated { function: "fn1", description: "..." }
description_generated { function: "fn2", description: "..." }
preprocessing_complete { functions: [...] }

  function_start { function: "fn1", index: 0, total: 2 }
  stage_start { stage: "rag_analysis" }
  rag_complete { function: "fn1", detected_cves: [...] }
  stage_start { stage: "validation" }
  validation_complete { function: "fn1", confirmed_count: 2 }
  stage_start { stage: "risk_scoring" }
  risk_complete { function: "fn1", summary: {...} }
  stage_start { stage: "remediation" }
  fix_attempt { function: "fn1", attempt: 1, max: 3 }
  fix_result { function: "fn1", verdict: "FIX_SUCCESSFUL", remaining: 0 }
  stage_start { stage: "reporting" }
  report_written { function: "fn1", result: {...} }

  function_start { function: "fn2", index: 1, total: 2 }
  ... (same sequence)

pipeline_complete { functions_analysed: 2, functions_fixed: 2 }
```

### Clean function (no vulnerabilities)

```
  function_start { function: "fn1", index: 0, total: 1 }
  stage_start { stage: "rag_analysis" }
  rag_complete { function: "fn1", detected_cves: [] }
  stage_start { stage: "validation" }
  validation_complete { function: "fn1", confirmed_count: 0 }
  stage_start { stage: "risk_scoring" }
  risk_complete { function: "fn1", summary: { Critical: 0, High: 0, Medium: 0, Low: 0 } }
  function_clean { function: "fn1" }
```

### Retry loop (fix fails, then succeeds)

```
  stage_start { stage: "remediation" }
  fix_attempt { function: "fn1", attempt: 1, max: 3 }
  fix_result { function: "fn1", verdict: "FIX_FAILED", remaining: 2 }
  fix_attempt { function: "fn1", attempt: 2, max: 3 }
  fix_result { function: "fn1", verdict: "FIX_SUCCESSFUL", remaining: 0 }
```

### Function-level error (pipeline continues)

```
  function_start { function: "fn1", index: 0, total: 2 }
  stage_start { stage: "rag_analysis" }
  error { message: "LLM timeout", stage: "rag_analyzer", function: "fn1" }

  function_start { function: "fn2", index: 1, total: 2 }
  ... (continues normally)

pipeline_complete { functions_analysed: 2, functions_fixed: 1 }
```

---

## Stage names reference

These are the valid values for the `stage` field in `stage_start` and `error` events:

| Stage name | Pipeline step | Has LLM call |
|------------|--------------|--------------|
| `preprocessing` | AST parsing + description generation | Yes |
| `rag_analysis` | CVE embedding search + LLM mapping | Yes |
| `validation` | Independent LLM cross-check | Yes |
| `risk_scoring` | Rule-based exploitability scoring | No |
| `remediation` | Fix generation + re-verification | Yes |
| `reporting` | JSON report with LLM audit | Yes |

---

## Frontend type definitions

For TypeScript consumers, the corresponding types are:

```typescript
type SSEEventType =
  | "connected"
  | "stage_start"
  | "description_generated"
  | "preprocessing_complete"
  | "function_start"
  | "rag_complete"
  | "validation_complete"
  | "risk_complete"
  | "fix_attempt"
  | "fix_result"
  | "function_clean"
  | "report_written"
  | "pdf_generated"
  | "pipeline_complete"
  | "error";

type StageName =
  | "preprocessing"
  | "rag_analysis"
  | "validation"
  | "risk_scoring"
  | "remediation"
  | "reporting";

type Verdict = "FIX_SUCCESSFUL" | "PARTIALLY_FIXED" | "FIX_FAILED";
type Severity = "Critical" | "High" | "Medium" | "Low";

interface Vulnerability {
  cve_id: string;
  vulnerability: string;
  exploitability: Severity;
  original_code: string;
  fixed_code: string;
  diff: string;
  verdict: Verdict;
}

interface FunctionResult {
  function_name: string;
  vulnerabilities: Vulnerability[];
  audit_trail: string;
}
```

---

## Implementation notes

- **Auto mode only.** The server always runs in auto mode. There is no interactive prompt. When local retries are exhausted, the best-effort fix is accepted. GPT escalation is not available via the API.
- **Heartbeats.** The server sends `: heartbeat\n\n` (SSE comment) every 15 seconds of idle time. Compliant parsers ignore these. They prevent proxy timeout on idle connections.
- **Error scope.** The presence of a `function` field in an `error` event distinguishes non-terminal (function-level) from terminal (pipeline-level) errors. Frontends should only enter a terminal error state for pipeline-level errors.
- **`report_written` payload size.** This event contains full source code (original + fixed) and a unified diff. For large functions, the payload can be substantial. Frontends should handle large SSE frames gracefully.
- **Concurrent requests.** The server holds a `ThreadPoolExecutor` with 4 workers. Pipeline stages are blocking (Ollama calls). The in-memory `FileStore` is per-job, so concurrent analyses for different jobs are safe.
