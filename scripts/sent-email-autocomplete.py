#!/usr/bin/env python3
"""
sent-email-autocomplete.py
Scans Jacob's SENT emails and auto-completes matching Asana tasks in the Big Board project.

Usage:
  python3 sent-email-autocomplete.py                 # Default: last 1 day
  python3 sent-email-autocomplete.py --days 3        # Extend lookback window
  python3 sent-email-autocomplete.py --dry-run       # Show matches, don't complete anything
  python3 sent-email-autocomplete.py --push          # Git commit + push hot-deals.json after
  python3 sent-email-autocomplete.py --verbose       # Detailed match logging
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, date
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────

WORKSPACE_ROOT   = Path("/Users/fostercreighton/.openclaw/workspace")
PROJECT_ROOT     = WORKSPACE_ROOT / "jd-command-center"
DATA_FILE        = PROJECT_ROOT / "data" / "hot-deals.json"
ENV_FILE         = WORKSPACE_ROOT / ".env"
GOG_BIN          = "/opt/homebrew/bin/gog"
GOG_ACCOUNT      = "jdelk@anchorinv.com"
ASANA_BASE       = "https://app.asana.com/api/1.0"
ASANA_PROJECT_GID = "1204790859570747"
MATCH_THRESHOLD  = 0.70   # minimum confidence to auto-complete

# ─── Env loading ──────────────────────────────────────────────────────────────

def load_env(path: Path) -> None:
    """Load .env file into os.environ."""
    if not path.exists():
        print(f"[WARN] .env not found at {path}", file=sys.stderr)
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, val = line.partition("=")
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key not in os.environ:
                    os.environ[key] = val


# ─── gog Gmail helpers ────────────────────────────────────────────────────────

def run_gog(args: list[str]) -> tuple[bool, str]:
    """Run a gog CLI command and return (success, stdout)."""
    cmd = [GOG_BIN] + args
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            print(f"[WARN] gog failed: {' '.join(args[:5])}", file=sys.stderr)
            if result.stderr:
                print(f"       {result.stderr[:300]}", file=sys.stderr)
            return False, ""
        return True, result.stdout.strip()
    except subprocess.TimeoutExpired:
        print(f"[WARN] gog timed out", file=sys.stderr)
        return False, ""
    except Exception as e:
        print(f"[WARN] gog error: {e}", file=sys.stderr)
        return False, ""


def parse_json_output(raw: str, label: str) -> list | dict | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[WARN] JSON parse failed for {label}: {e}", file=sys.stderr)
        return None


def fetch_sent_emails(days: int) -> list[dict]:
    """Fetch sent emails for the past N days."""
    query = f"in:sent newer_than:{days}d"
    print(f"[INFO] Fetching sent emails: {query}")

    ok, raw = run_gog([
        "gmail", "search", query,
        "--account", GOG_ACCOUNT,
        "--client", "default",
        "--json",
        "--limit", "100",
    ])
    if not ok:
        return []

    data = parse_json_output(raw, "Gmail sent")
    if not data:
        return []

    msgs = data if isinstance(data, list) else data.get("messages", data.get("threads", []))
    emails = [m for m in msgs if isinstance(m, dict)]
    print(f"[INFO] Fetched {len(emails)} sent emails.")
    return emails


# ─── Asana API helpers ────────────────────────────────────────────────────────

def asana_request(method: str, path: str, token: str, body: dict = None) -> tuple[bool, dict]:
    """Make an Asana API request using curl (avoids external Python deps)."""
    url = f"{ASANA_BASE}{path}"
    cmd = [
        "curl", "-s", "-X", method,
        "-H", f"Authorization: Bearer {token}",
        "-H", "Content-Type: application/json",
    ]
    if body:
        cmd += ["--data", json.dumps(body)]
    cmd.append(url)

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"[WARN] curl failed for {method} {path}", file=sys.stderr)
            return False, {}
        data = json.loads(result.stdout)
        if "errors" in data:
            print(f"[WARN] Asana error on {path}: {data['errors']}", file=sys.stderr)
            return False, data
        return True, data
    except Exception as e:
        print(f"[WARN] Asana request error: {e}", file=sys.stderr)
        return False, {}


def fetch_asana_tasks(token: str) -> list[dict]:
    """Fetch all open tasks from the Big Board project."""
    print(f"[INFO] Fetching Asana tasks from Big Board (GID: {ASANA_PROJECT_GID})")
    fields = "name,completed,gid,assignee.name,due_on,notes"
    path = f"/projects/{ASANA_PROJECT_GID}/tasks?opt_fields={fields}&completed_since=now"

    ok, data = asana_request("GET", path, token)
    if not ok:
        return []

    tasks = data.get("data", [])
    open_tasks = [t for t in tasks if not t.get("completed", False)]
    print(f"[INFO] Found {len(open_tasks)} open tasks in Big Board.")
    return open_tasks


def complete_asana_task(task_gid: str, token: str) -> bool:
    """Mark an Asana task as complete."""
    ok, _ = asana_request(
        "PUT",
        f"/tasks/{task_gid}",
        token,
        body={"data": {"completed": True}},
    )
    return ok


def comment_asana_task(task_gid: str, token: str, text: str) -> bool:
    """Add a comment to an Asana task."""
    ok, _ = asana_request(
        "POST",
        f"/tasks/{task_gid}/stories",
        token,
        body={"data": {"text": text}},
    )
    return ok


# ─── Email field extraction ───────────────────────────────────────────────────

def extract_email_addresses(field: str | list | dict | None) -> list[str]:
    """Extract email addresses from any to/cc field format."""
    if not field:
        return []
    if isinstance(field, list):
        addresses = []
        for item in field:
            addresses.extend(extract_email_addresses(item))
        return addresses
    if isinstance(field, dict):
        email = field.get("email", "")
        name = field.get("name", "")
        return [email.lower(), name.lower()] if email or name else []
    # String — parse "Name <email>" or comma-separated
    text = str(field)
    results = []
    # Extract all email addresses
    for addr in re.findall(r'[\w.+-]+@[\w.-]+\.\w+', text):
        results.append(addr.lower())
    # Also extract display names from "Name <email>" patterns
    for name in re.findall(r'"?([^"<,;]+)"?\s*<', text):
        name = name.strip()
        if name:
            results.append(name.lower())
    # If no structured form, just return the lowercased string
    if not results:
        results.append(text.lower())
    return results


def email_full_text(email: dict) -> str:
    """Build a single searchable string from all email fields."""
    parts = []
    for key in ("subject", "snippet", "from", "to", "cc"):
        val = email.get(key)
        if not val:
            continue
        if isinstance(val, (list, dict)):
            parts.extend(extract_email_addresses(val))
        else:
            parts.append(str(val))
    return " ".join(parts).lower()


# ─── Fuzzy matching ───────────────────────────────────────────────────────────

def tokenize(text: str) -> list[str]:
    """Lowercase, split into words of 3+ chars, strip noise."""
    STOP_WORDS = {
        "the", "and", "for", "with", "this", "that", "from", "have",
        "email", "send", "call", "fwd", "re:", "fw:", "re", "fw",
        "follow", "followup", "please", "can", "you", "your", "our",
        "will", "get", "got", "just", "let", "know", "need", "would",
        "been", "has", "had", "was", "are", "not", "but", "about",
    }
    words = re.split(r'[\s\W]+', text.lower())
    return [w for w in words if len(w) >= 3 and w not in STOP_WORDS]


def extract_names_from_task(task_name: str) -> list[str]:
    """
    Extract likely person names from a task name.
    "Email Derek Tucker" → ["Derek Tucker", "Derek", "Tucker"]
    "Call Shelby Hall re: HopeSmiles" → ["Shelby Hall", "Shelby", "Hall"]
    """
    # Remove common action verbs at start
    clean = re.sub(
        r'^(email|call|text|send|follow up with|follow-up|reach out to|reply to|respond to|contact|ping)\s+',
        '', task_name, flags=re.IGNORECASE
    ).strip()

    # Remove trailing context after common separators
    for sep in (' re:', ' re ', ' -', ' —', ' about', ' regarding', ' for', ':'):
        idx = clean.lower().find(sep)
        if idx > 0:
            clean = clean[:idx].strip()
            break

    names = []
    # The cleaned portion is likely a name — add it
    if len(clean) >= 3:
        names.append(clean.lower())
        # Also add individual name parts
        parts = clean.split()
        for part in parts:
            if len(part) >= 3:
                names.append(part.lower())

    return names


def extract_keywords_from_task(task_name: str) -> list[str]:
    """
    Extract meaningful keyword phrases from task name for subject matching.
    "Send Five Below LOI" → ["five below", "five", "below", "loi"]
    "Review Malone Five Below lease" → ["malone", "five below", "lease"]
    """
    tokens = tokenize(task_name)
    keywords = list(tokens)

    # Also try to identify multi-word company/property names
    # Look for consecutive capitalized words (likely proper nouns)
    proper_nouns = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b', task_name)
    for noun in proper_nouns:
        keywords.append(noun.lower())

    # Known abbreviations worth preserving
    for abbr in re.findall(r'\b(LOI|NDA|RFP|TI|SF|NNN|CAM)\b', task_name, re.IGNORECASE):
        keywords.append(abbr.lower())

    return list(set(keywords))


def score_match(task: dict, email: dict, verbose: bool = False) -> tuple[float, str]:
    """
    Return (confidence_score, match_reason) for a task-email pair.
    Score is 0.0–1.0. Threshold is MATCH_THRESHOLD (0.70).

    Strategies (first to hit wins; otherwise we sum signals):
    1. Direct name match: task action verb + name → person appears in To/CC/From
    2. Subject keyword match: key nouns from task → appear in email subject
    3. General keyword overlap: token intersection
    """
    task_name = task.get("name", "")
    email_subject = email.get("subject", "").lower()
    to_cc_text = " ".join(filter(None, [
        str(email.get("to", "")),
        str(email.get("cc", "")),
    ])).lower()
    full_text = email_full_text(email)

    signals = []

    # ── Strategy 1: Name match ─────────────────────────────────────────────
    # "Email Derek Tucker", "Call Shelby Hall", etc.
    task_lower = task_name.lower()
    is_action_task = bool(re.match(
        r'^(email|call|text|send|follow up|followup|contact|ping|reply|respond)',
        task_lower
    ))

    # Generic company/org words that shouldn't drive name-matches
    NAME_NOISE = {
        "anchor", "team", "group", "office", "company", "corp", "inc",
        "llc", "ltd", "associates", "partners", "properties", "investments",
        "realty", "capital", "management", "services", "solutions",
    }

    if is_action_task:
        names = extract_names_from_task(task_name)
        for name in names:
            if len(name) < 3:
                continue
            # Skip generic noise words as standalone matches
            if name.strip() in NAME_NOISE:
                continue
            # Check if name appears in To/CC headers (high confidence)
            if name in to_cc_text:
                signals.append((0.85, f"name '{name}' found in To/CC"))
                break
            # For body-text match: require multi-word name OR name >= 6 chars
            # (avoids "anchor", "team", short nouns triggering false positives)
            is_multi_word = " " in name
            is_long_name  = len(name) >= 6
            if (is_multi_word or is_long_name) and name in full_text:
                signals.append((0.75, f"name '{name}' found in email text"))
                break
        if verbose and is_action_task and not signals:
            names_str = ", ".join(names[:3])
            print(f"    [v] Action task, names tried: [{names_str}] — not in email")

    # ── Guard: action-type alignment ─────────────────────────────────────
    # "Call X" tasks can only match if there's evidence of a call, not just an email
    # "Redline X" tasks need redline/markup evidence, not just mentioning the property
    CALL_ONLY_VERBS = {"call", "text", "ping"}
    NON_EMAIL_VERBS = {"redline", "review", "sign", "print", "scan", "notarize"}
    task_first_word = task_lower.split()[0] if task_lower.split() else ""
    if task_first_word in CALL_ONLY_VERBS:
        # An email can't complete a "call" task — skip entirely
        return 0.0, "action type mismatch (call/text task, email found)"
    if task_first_word in NON_EMAIL_VERBS:
        # These need specific evidence in the email body, not just property name match
        return 0.0, "action type mismatch (non-email task)"

    # ── Strategy 2: Subject keyword match ─────────────────────────────────
    # "Send Five Below LOI" → subject contains "Five Below" AND "LOI"
    # Use word-boundary matching to avoid "market" matching "marketplace"
    keywords = extract_keywords_from_task(task_name)
    email_subject_tokens = set(tokenize(email_subject))
    if keywords:
        matched_kws = [kw for kw in keywords if (
            # Multi-word: substring match is fine (e.g. "emerson hall" in subject)
            (" " in kw and kw in email_subject) or
            # Single-word: require exact token match (avoids "market"→"marketplace")
            (" " not in kw and kw in email_subject_tokens)
        )]
        if len(matched_kws) >= 2:
            score = min(0.80 + 0.05 * (len(matched_kws) - 2), 0.95)
            signals.append((score, f"subject keywords {matched_kws}"))
        elif len(matched_kws) == 1 and len(matched_kws[0]) >= 6:
            # Single long/specific keyword in subject — moderate confidence
            # Raised from 5 to 6 chars to filter noise like "yardi", "market"
            signals.append((0.65, f"subject keyword [{matched_kws[0]}]"))

        if verbose:
            print(f"    [v] Keywords from task: {keywords[:6]} | matched in subject: {matched_kws}")

    # ── Strategy 3: Full-text keyword overlap ─────────────────────────────
    task_tokens = set(tokenize(task_name))
    email_tokens = set(tokenize(email_subject + " " + email.get("snippet", "")))
    if task_tokens and email_tokens:
        overlap = task_tokens & email_tokens
        ratio = len(overlap) / len(task_tokens) if task_tokens else 0
        if ratio >= 0.5 and len(overlap) >= 2:
            signals.append((0.60 + ratio * 0.20, f"token overlap {overlap} ({ratio:.0%})"))

    if not signals:
        return 0.0, "no match"

    # Take highest-scoring signal
    best_score, best_reason = max(signals, key=lambda x: x[0])

    # Boost if task and email are same day
    email_date = email.get("date", "")
    if email_date and date.today().isoformat() in str(email_date):
        best_score = min(best_score + 0.05, 1.0)
        best_reason += " [+same-day]"

    return best_score, best_reason


# ─── hot-deals.json updater ───────────────────────────────────────────────────

def update_hot_deals_completed(completed_task_names: list[str], dry_run: bool) -> None:
    """Append completed task names to hot-deals.json weeklyDiff.completed."""
    if not completed_task_names:
        return

    try:
        with open(DATA_FILE) as f:
            data = json.load(f)
    except Exception as e:
        print(f"[WARN] Could not load hot-deals.json: {e}", file=sys.stderr)
        return

    weekly_diff = data.setdefault("weeklyDiff", {})
    existing = weekly_diff.setdefault("completed", [])

    added = 0
    for name in completed_task_names:
        label = f"{name} — auto-completed via sent email"
        if label not in existing:
            existing.append(label)
            added += 1

    if added == 0:
        print("[INFO] No new entries to add to weeklyDiff.completed.")
        return

    if dry_run:
        print(f"[DRY-RUN] Would add {added} item(s) to weeklyDiff.completed in hot-deals.json")
        return

    data["lastUpdated"] = datetime.now().isoformat()
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[INFO] Updated hot-deals.json: added {added} item(s) to weeklyDiff.completed")


# ─── Git push ─────────────────────────────────────────────────────────────────

def git_push(project_root: Path) -> bool:
    try:
        subprocess.run(
            ["git", "add", "data/hot-deals.json"],
            cwd=project_root, check=True, capture_output=True
        )
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=project_root, capture_output=True
        )
        if result.returncode == 0:
            print("[INFO] No changes to commit.")
            return True

        subprocess.run(
            ["git", "commit", "-m", f"chore: sent-email-autocomplete — {date.today().isoformat()}"],
            cwd=project_root, check=True, capture_output=True
        )
        subprocess.run(
            ["git", "push"],
            cwd=project_root, check=True, capture_output=True
        )
        print("[INFO] Pushed to origin.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[WARN] Git push failed: {e}", file=sys.stderr)
        return False


# ─── Core matching loop ───────────────────────────────────────────────────────

def run_matching(
    tasks: list[dict],
    emails: list[dict],
    asana_token: str,
    dry_run: bool,
    verbose: bool,
) -> list[str]:
    """
    Match tasks to emails. Each email can complete at most ONE task (the best match).
    Returns list of task names that were completed.
    """
    completed_names = []
    total_evaluated = 0
    total_matched = 0
    total_skipped = 0

    print(f"\n[INFO] Evaluating {len(tasks)} tasks against {len(emails)} sent emails...\n")

    # Phase 1: Score all task-email pairs
    candidates = []  # (score, reason, task, email)
    for task in tasks:
        task_name = task.get("name", "").strip()
        task_gid  = task.get("gid", "")
        if not task_name or not task_gid:
            continue
        total_evaluated += 1

        for email in emails:
            score, reason = score_match(task, email, verbose=False)
            if score >= MATCH_THRESHOLD:
                candidates.append((score, reason, task, email))

    # Phase 2: Greedy assignment — highest score first, each email claimed once
    candidates.sort(key=lambda x: x[0], reverse=True)
    claimed_emails = set()    # email IDs already used
    claimed_tasks = set()     # task GIDs already matched

    for score, reason, task, email in candidates:
        task_gid = task["gid"]
        email_id = email.get("id", email.get("threadId", id(email)))

        if task_gid in claimed_tasks or email_id in claimed_emails:
            continue

        task_name = task["name"].strip()
        subject = email.get("subject", "(no subject)")[:80]
        email_date = email.get("date", "today")

        claimed_emails.add(email_id)
        claimed_tasks.add(task_gid)
        total_matched += 1

        if verbose:
            print(f"  Task: {task_name}")
            print(f"    Best match: [{score:.2f}] {subject}")
            print(f"    Reason: {reason}")

        print(f"  ✅ MATCH [{score:.2f}] Task: \"{task_name}\"")
        print(f"          Email: \"{subject}\" ({email_date})")
        print(f"          Reason: {reason}")

        if dry_run:
            print(f"          [DRY-RUN] Would complete task GID {task_gid}")
            completed_names.append(task_name)
            continue

        # Complete the task
        ok = complete_asana_task(task_gid, asana_token)
        if ok:
            comment_text = f"✅ Auto-completed by Jarvis — matched to sent email: {subject}"
            comment_asana_task(task_gid, asana_token, comment_text)
            print(f"          → Completed + commented in Asana ✓")
            completed_names.append(task_name)
        else:
            print(f"          → [WARN] Failed to complete task in Asana", file=sys.stderr)

    total_skipped = total_evaluated - total_matched

    print(f"\n[SUMMARY] Evaluated: {total_evaluated} | Matched: {total_matched} | Skipped/no-match: {total_skipped}")
    return completed_names


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Auto-complete Asana Big Board tasks matched to Jacob's sent emails."
    )
    parser.add_argument("--days",    type=int, default=1,  help="Lookback window in days (default: 1)")
    parser.add_argument("--dry-run", action="store_true",  help="Show matches but don't complete anything")
    parser.add_argument("--push",    action="store_true",  help="Git commit + push hot-deals.json after")
    parser.add_argument("--verbose", action="store_true",  help="Detailed match logging")
    args = parser.parse_args()

    print(f"[INFO] sent-email-autocomplete — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[INFO] Lookback: {args.days} day(s) | dry-run: {args.dry_run} | push: {args.push}")

    # Load .env
    load_env(ENV_FILE)
    asana_token = os.environ.get("ASANA_TOKEN", "")
    if not asana_token:
        print("[ERROR] ASANA_TOKEN not found in environment / .env", file=sys.stderr)
        sys.exit(1)

    # Fetch data
    emails = fetch_sent_emails(args.days)
    if not emails:
        print("[WARN] No sent emails fetched — nothing to match.")
        sys.exit(0)

    tasks = fetch_asana_tasks(asana_token)
    if not tasks:
        print("[WARN] No open Asana tasks found — nothing to complete.")
        sys.exit(0)

    if args.dry_run:
        print("\n[DRY-RUN MODE] No tasks will be completed. Showing matches only.\n")

    # Run matching
    completed = run_matching(
        tasks=tasks,
        emails=emails,
        asana_token=asana_token,
        dry_run=args.dry_run,
        verbose=args.verbose,
    )

    # Update hot-deals.json
    if completed:
        update_hot_deals_completed(completed, dry_run=args.dry_run)

    # Git push
    if args.push and not args.dry_run and completed:
        git_push(PROJECT_ROOT)

    print("\n[INFO] Done.")


if __name__ == "__main__":
    main()
