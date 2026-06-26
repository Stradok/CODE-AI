"""
api/github_scanner.py — Fetch and filter Python files from a public GitHub repo.

Uses only stdlib (urllib) so no extra dependencies are needed.
Rate limits: 60 unauthenticated requests/hour for the GitHub API.
We use 2 API calls (repo info + tree), then raw.githubusercontent.com
for file content (separate CDN, no rate limit for reasonable usage).
"""

import json
import re
import urllib.request
import urllib.error
from loguru import logger

# Directories that are never worth scanning for CVEs
_SKIP_DIRS = frozenset({
    "tests", "test", "testing", "migrations", "alembic",
    "venv", ".venv", "env", "virtualenv", "site-packages",
    "__pycache__", ".git", "node_modules",
    "docs", "doc", "documentation", "examples", "example",
    "fixtures", "scripts", "tools", "bin", "build", "dist",
    ".eggs", "htmlcov", "coverage", "benchmarks",
})

# File names to skip regardless of location
_SKIP_FILES = frozenset({
    "setup.py", "setup.cfg", "conf.py", "conftest.py",
    "manage.py", "wsgi.py", "asgi.py",
})

# File name patterns that indicate test files
_TEST_PATTERNS = ("test_", "_test.py", "_tests.py", "spec_")

# Security-sensitive names — scan these first
_SECURITY_NAMES = frozenset({
    "auth", "authn", "authz", "authentication", "authorization",
    "security", "crypto", "encrypt", "decrypt", "hash", "password",
    "token", "jwt", "oauth", "session", "cookie", "middleware",
    "permissions", "access", "login", "register", "signup",
    "database", "db", "query", "sql", "orm", "model",
    "upload", "download", "file", "path", "url", "request",
    "api", "views", "routes", "endpoints", "handlers",
})


def parse_github_url(url: str) -> tuple[str, str]:
    """Parse a GitHub URL into (owner, repo). Raises ValueError if invalid."""
    cleaned = url.strip().rstrip("/")
    # Handle https://github.com/owner/repo and github.com/owner/repo
    match = re.match(
        r"(?:https?://)?github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?$",
        cleaned,
    )
    if not match:
        raise ValueError(
            f"'{url}' is not a valid GitHub repo URL. "
            "Expected format: https://github.com/owner/repo"
        )
    return match.group(1), match.group(2)


def _github_api(path: str, token: str = "") -> dict | list:
    url = f"https://api.github.com{path}"
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github.v3+json")
    req.add_header("User-Agent", "CODE-AI-CVE-Scanner/1.0")
    if token:
        req.add_header("Authorization", f"token {token}")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        if exc.code == 403:
            raise RuntimeError(
                "GitHub API rate limit hit (60 req/hr unauthenticated). "
                "Add a GitHub token in the repo scan settings to get 5,000 req/hr."
            ) from exc
        if exc.code == 404:
            raise RuntimeError("Repository not found or is private.") from exc
        raise RuntimeError(f"GitHub API error {exc.code}: {exc.reason}") from exc


def _fetch_raw(owner: str, repo: str, branch: str, path: str, token: str = "") -> str:
    url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "CODE-AI-CVE-Scanner/1.0")
    if token:
        req.add_header("Authorization", f"token {token}")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _should_skip(path: str) -> bool:
    parts = path.split("/")
    filename = parts[-1]

    # Skip if any parent directory is in the skip list
    for part in parts[:-1]:
        if part.lower() in _SKIP_DIRS:
            return True

    # Skip specific filenames
    if filename in _SKIP_FILES:
        return True

    # Skip test files
    for pattern in _TEST_PATTERNS:
        if filename.startswith(pattern) or filename.endswith(pattern.lstrip("_")):
            return True

    # Skip __init__.py unless it's at root (often just re-exports)
    if filename == "__init__.py" and len(parts) > 2:
        return True

    return False


def _security_score(path: str) -> int:
    """Lower = higher priority. 0 = security-critical file."""
    name = path.split("/")[-1].replace(".py", "").lower()
    for keyword in _SECURITY_NAMES:
        if keyword in name:
            return 0
    return 1


def fetch_repo_python_files(
    owner: str,
    repo: str,
    token: str = "",
    max_files: int = 15,
) -> list[dict]:
    """
    Return up to max_files Python files from the repo as {path, content} dicts.

    Files are prioritised:
      1. Security-sensitive names (auth, crypto, session, sql, …)
      2. Shallow files (closer to repo root = higher-level entry points)
      3. Smaller files (faster to scan, less likely to be generated code)
    """
    # 1. Get default branch
    repo_info = _github_api(f"/repos/{owner}/{repo}", token)
    branch = repo_info.get("default_branch", "main")
    logger.info("[GH] Repo={}/{} branch={}", owner, repo, branch)

    # 2. Get full recursive file tree
    tree_data = _github_api(
        f"/repos/{owner}/{repo}/git/trees/{branch}?recursive=1", token
    )
    if tree_data.get("truncated"):
        logger.warning("[GH] Tree truncated — repo is very large, only partial results")

    # 3. Filter to Python files worth scanning
    candidates = []
    for item in tree_data.get("tree", []):
        if item.get("type") != "blob":
            continue
        path = item["path"]
        if not path.endswith(".py"):
            continue
        if _should_skip(path):
            continue
        size = item.get("size", 0)
        if size > 120_000:  # skip files > 120 KB (probably generated/minified)
            continue
        if size < 50:  # skip near-empty files
            continue
        candidates.append({"path": path, "size": size})

    logger.info("[GH] {} Python files after filtering (max {})", len(candidates), max_files)

    # 4. Prioritise: security files first, then by depth, then by size
    candidates.sort(key=lambda f: (
        _security_score(f["path"]),
        f["path"].count("/"),
        f["size"],
    ))
    candidates = candidates[:max_files]

    # 5. Fetch content (raw CDN — no API quota consumed)
    results = []
    for f in candidates:
        try:
            content = _fetch_raw(owner, repo, branch, f["path"], token)
            if content.strip():
                results.append({"path": f["path"], "content": content})
                logger.debug("[GH] Fetched {} ({} bytes)", f["path"], len(content))
        except Exception as exc:
            logger.warning("[GH] Could not fetch {}: {}", f["path"], exc)

    logger.info("[GH] Fetched {}/{} files successfully", len(results), len(candidates))
    return results
