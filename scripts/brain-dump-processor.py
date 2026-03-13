#!/usr/bin/env python3
"""
brain-dump-processor.py
Processes brain dump entries from Jacob and routes them to the right systems.

Sources:
  - GET https://jd-command-center.vercel.app/api/brain-dump

Routes to:
  - Asana tasks (Big Board) — action items
  - hot-deals.json — stage changes, deal updates, general notes

Usage:
  python3 brain-dump-processor.py             # Process pending brain dumps
  python3 brain-dump-processor.py --dry-run   # Show what would happen, don't write
  python3 brain-dump-processor.py --push      # Git commit + push hot-deals.json after
  python3 brain-dump-processor.py --verbose   # Detailed parsing/classification logs
"""

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.parse
from datetime import date, datetime, timedelta
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────

WORKSPACE_ROOT = Path("/Users/fostercreighton/.openclaw/workspace")
PROJECT_ROOT   = WORKSPACE_ROOT / "jd-command-center"
DATA_FILE      = PROJECT_ROOT / "data" / "hot-deals.json"
ENV_FILE       = WORKSPACE_ROOT / ".env"

BRAIN_DUMP_API = "https://jd-command-center.vercel.app/api/brain-dump"

# Asana
ASANA_BASE        = "https://app.asana.com/api/1.0"
ASANA_PROJECT_GID = "1204790859570747"   # Big Board
ASANA_TAG_GID     = "1213284253537458"   # Jarvis tag

# Stage ordering — forward-only rule
STAGE_ORDER = [
    "Contact Made",
    "Touring",
    "Obtain Financials",
    "Trading Terms",
    "LOI",
    "Lease Draft & Review",
    "Lease Signed",
    "Stalled",
]

# ─── Classification keywords ───────────────────────────────────────────────────

ACTION_KEYWORDS = [
    "call", "email", "send", "draft", "follow up", "follow-up",
    "schedule", "set up", "reach out", "text", "check on", "remind me",
    "ping", "contact", "confirm", "book", "get",
]

DEAL_UPDATE_KEYWORDS = [
    "signed", "dead", "pulled out", "not interested", "moving forward",
    "approved", "counter", "rejected", "declined", "no go", "fell through",
    "backing out", "walked away", "executed", "closed",
]

STAGE_KEYWORDS: dict[str, list[str]] = {
    "Lease Signed": [
        "signed", "executed", "docusign", "fully executed", "lease signed",
        "signing complete", "all parties signed",
    ],
    "Lease Draft & Review": [
        "lease draft", "lease review", "reviewing lease", "sent lease",
        "lease sent", "redline", "lease back",
    ],
    "LOI": [
        "loi", "letter of intent", "loi signed", "loi received",
        "loi sent", "loi back", "loi countered",
    ],
    "Obtain Financials": [
        "financials", "credit app", "credit application", "financial statement",
        "submitted financials", "sent financials",
    ],
    "Touring": [
        "touring", "tour scheduled", "site visit", "showing", "showed them",
        "toured", "walk through", "walkthrough",
    ],
}

# Regex pattern to split text into sentences/chunks
SENTENCE_SPLITTER = re.compile(r'(?<=[.!?])\s+|(?:\n)')


# ─── Helpers ──────────────────────────────────────────────────────────────────

def log(msg: str, verbose: bool = False, always: bool = False):
    """Print log message. verbose-only messages require --verbose flag."""
    if always or not verbose:
        print(msg)
    elif verbose:
        print(msg)


def load_env(path: Path) -> dict:
    """Parse .env file and return key→value dict."""
    env = {}
    if not path.exists():
        print(f"[WARN] .env not found at {path}", file=sys.stderr)
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def stage_index(stage: str) -> int:
    """Return forward-ordering index of a stage. -1 if unknown."""
    try:
        return STAGE_ORDER.index(stage)
    except ValueError:
        return -1


def tomorrow_iso() -> str:
    """Return tomorrow's date as ISO string."""
    return (date.today() + timedelta(days=1)).isoformat()


def today_iso() -> str:
    return date.today().isoformat()


# ─── Fuzzy deal matching ───────────────────────────────────────────────────────

def normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse spaces."""
    return re.sub(r'\s+', ' ', re.sub(r'[^\w\s]', ' ', text.lower())).strip()


def get_deal_search_tokens(deal: dict) -> list[str]:
    """
    Return a list of searchable tokens from a deal:
    name words, property words, contact name words.
    Only tokens 3+ chars are included.
    """
    tokens = []

    def tokenize(text: str):
        if not text:
            return
        normed = normalize(text)
        # Add full phrase
        tokens.append(normed)
        # Add individual significant words
        for word in normed.split():
            if len(word) >= 3:
                tokens.append(word)

    tokenize(deal.get("name", ""))
    tokenize(deal.get("property", ""))
    for contact_raw in deal.get("contacts", []):
        # Strip parenthetical titles: "Amy Harper (Tenant)" → "Amy Harper"
        name = re.sub(r'\s*\(.*?\)', '', contact_raw).strip()
        tokenize(name)
        # Add last name alone
        parts = name.split()
        if parts:
            tokenize(parts[-1])

    return tokens


def fuzzy_match_deal(text: str, data: dict, verbose: bool = False) -> dict | None:
    """
    Find the best-matching deal in pipelineDeals + sideDeals by keyword overlap.
    Returns the deal dict if a confident match is found, else None.
    """
    text_normed = normalize(text)
    text_words  = set(w for w in text_normed.split() if len(w) >= 3)

    best_deal  = None
    best_score = 0

    all_deals = data.get("pipelineDeals", []) + data.get("sideDeals", [])

    for deal in all_deals:
        tokens = get_deal_search_tokens(deal)
        score  = 0

        for token in tokens:
            if token in text_normed:
                # Longer tokens get higher weight (full name > single word)
                score += len(token.split())

        if score > best_score:
            best_score = score
            best_deal  = deal

    # Require at least 1 meaningful token hit (score >= 1)
    if best_score >= 1 and best_deal:
        if verbose:
            print(f"  [MATCH] '{text[:60]}' → {best_deal.get('name')} @ {best_deal.get('property')} (score={best_score})")
        return best_deal

    if verbose:
        print(f"  [NO MATCH] Could not match: '{text[:60]}'")
    return None


# ─── Classification ────────────────────────────────────────────────────────────

def classify_line(line: str, verbose: bool = False) -> dict:
    """
    Classify a single line/sentence into one or more classifications.
    Returns dict with keys:
      - is_action: bool
      - is_deal_update: bool
      - stage: str | None      (detected stage keyword)
      - raw: str               (original line)
    """
    lower = line.lower()
    result = {
        "raw":           line.strip(),
        "is_action":     False,
        "is_deal_update": False,
        "stage":         None,
    }

    if not line.strip():
        return result

    # Action item check
    for kw in ACTION_KEYWORDS:
        if kw in lower:
            result["is_action"] = True
            if verbose:
                print(f"  [ACTION] Keyword '{kw}' matched in: '{line.strip()[:60]}'")
            break

    # Deal update check
    for kw in DEAL_UPDATE_KEYWORDS:
        if kw in lower:
            result["is_deal_update"] = True
            if verbose:
                print(f"  [DEAL UPDATE] Keyword '{kw}' matched in: '{line.strip()[:60]}'")
            break

    # Stage detection — check from highest stage down (most specific wins)
    for stage in reversed(STAGE_ORDER):
        if stage not in STAGE_KEYWORDS:
            continue
        for kw in STAGE_KEYWORDS[stage]:
            if kw in lower:
                result["stage"] = stage
                if verbose:
                    print(f"  [STAGE] '{kw}' → {stage} in: '{line.strip()[:60]}'")
                break
        if result["stage"]:
            break

    # If stage "Lease Signed" is detected, that also counts as a deal update
    if result["stage"] == "Lease Signed":
        result["is_deal_update"] = True

    return result


def split_into_segments(text: str) -> list[str]:
    """
    Split a brain dump text into processable segments.
    Handles: newlines, bullet points, numbered lists, and sentence boundaries.
    """
    # First split on newlines
    lines = text.splitlines()
    segments = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # Remove bullet/number prefixes
        line = re.sub(r'^[-•*]\s+', '', line)
        line = re.sub(r'^\d+\.\s+', '', line)

        # Further split on sentence boundaries for longer chunks
        if len(line) > 100:
            parts = SENTENCE_SPLITTER.split(line)
            segments.extend(p.strip() for p in parts if p.strip())
        else:
            segments.append(line)

    return segments


# ─── Asana API ─────────────────────────────────────────────────────────────────

def create_asana_task(name: str, notes: str, asana_token: str,
                      dry_run: bool = False, verbose: bool = False) -> str | None:
    """
    Create an Asana task in the Big Board project with the Jarvis tag.
    Returns the task GID if created, else None.
    """
    due_date = tomorrow_iso()

    if dry_run:
        print(f"  [DRY-RUN] Would create Asana task: '{name}' (due {due_date})")
        return "dry-run-gid"

    payload = {
        "data": {
            "name":     name,
            "notes":    notes,
            "projects": [ASANA_PROJECT_GID],
            "tags":     [ASANA_TAG_GID],
            "due_on":   due_date,
        }
    }

    body = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        f"{ASANA_BASE}/tasks",
        data=body,
        headers={
            "Authorization":  f"Bearer {asana_token}",
            "Content-Type":   "application/json",
            "Accept":         "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp_data = json.loads(resp.read().decode())
            task_gid  = resp_data.get("data", {}).get("gid", "")
            if verbose:
                print(f"  [ASANA] Created task GID={task_gid}: '{name}'")
            return task_gid
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()[:300]
        print(f"[WARN] Asana task creation failed: {e.code} {err_body}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[WARN] Asana API error: {e}", file=sys.stderr)
        return None


# ─── Brain dump API ────────────────────────────────────────────────────────────

def fetch_brain_dumps() -> list[dict]:
    """Fetch pending brain dumps from the command center API."""
    print(f"[INFO] Fetching brain dumps from {BRAIN_DUMP_API}")
    try:
        req = urllib.request.Request(
            BRAIN_DUMP_API,
            headers={"Accept": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = json.loads(resp.read().decode())
            # API may return a bare list OR { brainDumps: [...] }
            if isinstance(raw, list):
                dumps = raw
            elif isinstance(raw, dict):
                dumps = raw.get("brainDumps", raw.get("items", []))
            else:
                dumps = []
            print(f"[INFO] Got {len(dumps)} brain dump entries.")
            return dumps
    except Exception as e:
        print(f"[WARN] Failed to fetch brain dumps: {e}", file=sys.stderr)
        return []


def mark_brain_dump_processed(timestamp: str, dry_run: bool = False) -> bool:
    """Mark a brain dump entry as processed via POST to the API."""
    if dry_run:
        print(f"  [DRY-RUN] Would mark processed: {timestamp}")
        return True

    payload = json.dumps({"timestamp": timestamp, "processed": True}).encode("utf-8")
    req = urllib.request.Request(
        BRAIN_DUMP_API,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept":       "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status < 300
    except Exception as e:
        print(f"[WARN] Failed to mark brain dump processed: {e}", file=sys.stderr)
        return False


# ─── Core processing ───────────────────────────────────────────────────────────

def process_brain_dump(entry: dict, data: dict, asana_token: str,
                       dry_run: bool = False, verbose: bool = False) -> dict:
    """
    Process a single brain dump entry. Modifies `data` in place.
    Returns a summary of actions taken.
    """
    text       = entry.get("text", "").strip()
    timestamp  = entry.get("timestamp", today_iso())
    entry_date = timestamp[:10] if len(timestamp) >= 10 else today_iso()

    summary = {
        "timestamp":      timestamp,
        "text":           text,
        "asana_tasks":    [],   # list of task names created
        "deal_updates":   [],   # list of (deal_name, what changed)
        "stage_changes":  [],   # list of (deal_name, old_stage, new_stage)
        "notes_added":    [],   # list of (deal_name, note text)
        "unmatched":      [],   # lines that didn't match anything
    }

    if not text:
        return summary

    print(f"\n[INFO] Processing brain dump @ {timestamp}")
    if verbose:
        print(f"  Text: {text[:120]}")

    segments = split_into_segments(text)
    if verbose:
        print(f"  Segments ({len(segments)}): {segments}")

    for segment in segments:
        if not segment.strip():
            continue

        classification = classify_line(segment, verbose=verbose)
        matched_deal   = fuzzy_match_deal(segment, data, verbose=verbose)

        handled = False

        # ── Stage change ──────────────────────────────────────────────────
        if classification["stage"] and matched_deal is not None:
            new_stage     = classification["stage"]
            current_stage = matched_deal.get("stageOverride") or matched_deal.get("stage", "")
            current_idx   = stage_index(current_stage)
            new_idx       = stage_index(new_stage)

            if new_idx > current_idx:
                deal_name = matched_deal.get("name", "Unknown")
                print(f"  [STAGE] {deal_name}: {current_stage} → {new_stage}")

                if not dry_run:
                    # stageOverride takes precedence per instructions
                    matched_deal["stageOverride"]       = new_stage
                    matched_deal["stageOverrideDate"]   = entry_date
                    matched_deal["stageOverrideSource"] = f"brain-dump: {segment[:80]}"
                    matched_deal["stage"]               = new_stage
                    # Add timeline entry
                    matched_deal.setdefault("timeline", []).insert(0, {
                        "date":  entry_date,
                        "event": f"Stage advanced to {new_stage} (brain dump: {segment[:80]})",
                        "type":  "milestone",
                    })

                summary["stage_changes"].append(
                    (matched_deal.get("name"), current_stage, new_stage)
                )
                handled = True

        # ── Deal update (status change) ───────────────────────────────────
        if classification["is_deal_update"] and matched_deal is not None:
            deal_name = matched_deal.get("name", "Unknown")
            print(f"  [DEAL UPDATE] {deal_name}: {segment[:80]}")

            if not dry_run:
                # Update status field
                matched_deal["status"] = segment.strip()
                matched_deal["lastUpdate"] = entry_date
                # Add timeline milestone
                matched_deal.setdefault("timeline", []).insert(0, {
                    "date":  entry_date,
                    "event": segment.strip()[:120],
                    "type":  "milestone",
                })

            summary["deal_updates"].append((deal_name, segment[:80]))
            handled = True

        # ── Action item → Asana ───────────────────────────────────────────
        if classification["is_action"]:
            task_name = segment.strip()
            deal_ctx  = matched_deal.get("name", "") if matched_deal else ""
            notes_text = f"Brain dump @ {timestamp}"
            if deal_ctx:
                notes_text += f"\nDeal: {deal_ctx} — {matched_deal.get('property', '')}"
            notes_text += f"\nFull text: {text[:500]}"

            print(f"  [ASANA] Task: '{task_name[:80]}'")
            gid = create_asana_task(task_name, notes_text, asana_token,
                                    dry_run=dry_run, verbose=verbose)
            if gid:
                summary["asana_tasks"].append(task_name)

            # Also add as timeline note on matched deal if there is one
            if matched_deal is not None and not dry_run:
                matched_deal.setdefault("timeline", []).insert(0, {
                    "date":  entry_date,
                    "event": f"Action item created: {task_name[:80]}",
                    "type":  "task",
                })

            handled = True

        # ── General note on matched deal ──────────────────────────────────
        if not handled and matched_deal is not None:
            deal_name = matched_deal.get("name", "Unknown")
            print(f"  [NOTE] {deal_name}: {segment[:80]}")

            if not dry_run:
                matched_deal.setdefault("timeline", []).insert(0, {
                    "date":  entry_date,
                    "event": segment.strip()[:120],
                    "type":  "note",
                })

            summary["notes_added"].append((deal_name, segment[:80]))
            handled = True

        # ── Unmatched — store in brainDumps array ─────────────────────────
        if not handled:
            print(f"  [UNMATCHED] No deal match: '{segment[:80]}'")
            summary["unmatched"].append(segment)

            if not dry_run:
                data.setdefault("brainDumps", []).append({
                    "text":      segment.strip(),
                    "timestamp": timestamp,
                    "processed": True,
                    "type":      "unmatched",
                    "addedAt":   datetime.now().isoformat(),
                })

    return summary


# ─── Git push ─────────────────────────────────────────────────────────────────

def git_push(project_root: Path) -> bool:
    try:
        subprocess.run(
            ["git", "add", "data/hot-deals.json"],
            cwd=project_root, check=True, capture_output=True
        )
        diff = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=project_root, capture_output=True
        )
        if diff.returncode == 0:
            print("[INFO] No changes to commit.")
            return True

        subprocess.run(
            ["git", "commit", "-m", f"chore: brain dump processing — {date.today().isoformat()}"],
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


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Process Jacob's brain dumps and route to Asana / hot-deals.json."
    )
    parser.add_argument("--dry-run",  action="store_true", help="Show what would happen, don't write")
    parser.add_argument("--push",     action="store_true", help="Git commit + push hot-deals.json after")
    parser.add_argument("--verbose",  action="store_true", help="Detailed parsing/classification logs")
    args = parser.parse_args()

    print(f"[INFO] Brain dump processor — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if args.dry_run:
        print("[INFO] DRY-RUN mode — no files will be written, no tasks created.")

    # Load env and data
    env  = load_env(ENV_FILE)
    data = load_json(DATA_FILE)

    asana_token = env.get("ASANA_TOKEN", "")
    if not asana_token and not args.dry_run:
        print("[WARN] ASANA_TOKEN not set — Asana tasks will be skipped.", file=sys.stderr)

    # Fetch brain dumps
    brain_dumps = fetch_brain_dumps()

    # Filter to unprocessed only
    pending = [b for b in brain_dumps if not b.get("processed", False)]
    print(f"[INFO] {len(pending)} unprocessed brain dump(s) to process.")

    if not pending:
        print("[INFO] Nothing to do.")
        return

    # Deep copy data for dry-run (don't mutate the real dict)
    import copy
    working_data = copy.deepcopy(data)

    all_summaries   = []
    changes_made    = False

    for entry in pending:
        summary = process_brain_dump(
            entry, working_data, asana_token,
            dry_run=args.dry_run, verbose=args.verbose
        )
        all_summaries.append(summary)

        # Any action taken on data = changes made
        if (summary["stage_changes"] or summary["deal_updates"] or
                summary["notes_added"] or summary["unmatched"]):
            changes_made = True

        # Mark as processed in the API
        ts = entry.get("timestamp", "")
        if ts:
            mark_brain_dump_processed(ts, dry_run=args.dry_run)

    # Update lastUpdated
    if not args.dry_run and changes_made:
        working_data["lastUpdated"] = datetime.now().isoformat()

    # ── Summary report ─────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("[SUMMARY] Brain dump processing complete")
    print("="*60)

    total_tasks   = sum(len(s["asana_tasks"])   for s in all_summaries)
    total_updates = sum(len(s["deal_updates"])  for s in all_summaries)
    total_stages  = sum(len(s["stage_changes"]) for s in all_summaries)
    total_notes   = sum(len(s["notes_added"])   for s in all_summaries)
    total_unmatched = sum(len(s["unmatched"])   for s in all_summaries)

    print(f"  Asana tasks created:  {total_tasks}")
    print(f"  Deal updates:         {total_updates}")
    print(f"  Stage changes:        {total_stages}")
    print(f"  Notes added:          {total_notes}")
    print(f"  Unmatched segments:   {total_unmatched}")

    if total_stages > 0:
        print("\n  Stage changes:")
        for s in all_summaries:
            for deal_name, old, new in s["stage_changes"]:
                print(f"    {deal_name}: {old} → {new}")

    if total_unmatched > 0:
        print("\n  Unmatched (stored in brainDumps[]):")
        for s in all_summaries:
            for seg in s["unmatched"]:
                print(f"    - {seg[:80]}")

    # ── Write hot-deals.json ────────────────────────────────────────────────
    if args.dry_run:
        print("\n[DRY-RUN] No files written.")
        return

    if changes_made:
        DATA_FILE.write_text(json.dumps(working_data, indent=2, ensure_ascii=False))
        print(f"\n[INFO] Written: {DATA_FILE}")

        if args.push:
            git_push(PROJECT_ROOT)
    else:
        print("\n[INFO] No data changes — hot-deals.json not modified.")

    print("[INFO] Done.")


if __name__ == "__main__":
    main()
