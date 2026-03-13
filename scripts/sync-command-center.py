#!/usr/bin/env python3
"""
sync-command-center.py
Master sync script for Jacob's Command Center dashboard.
Refreshes hot-deals.json with live data from Google Drive, Calendar, and Pipedrive.

Usage:
  python3 sync-command-center.py           # Update hot-deals.json in place
  python3 sync-command-center.py --push    # Update + git commit + push
  python3 sync-command-center.py --dry-run # Print changes, don't write
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, date
from pathlib import Path
import urllib.request
import urllib.parse

# ─── Config ───────────────────────────────────────────────────────────────────

WORKSPACE_ROOT = Path("/Users/fostercreighton/.openclaw/workspace")
PROJECT_ROOT   = WORKSPACE_ROOT / "jd-command-center"
DATA_FILE      = PROJECT_ROOT / "data" / "hot-deals.json"
ENV_FILE       = WORKSPACE_ROOT / ".env"
GOG_BIN        = "/opt/homebrew/bin/gog"
DRIVE_FOLDER   = "1VjGsjf8_m2Ucws3eUDAk2G3ejI72lVal"
GOG_ACCOUNT    = "jdelk@anchorinv.com"

STAGE_MAP = {
    22: "Contact Made",
    23: "Touring",
    24: "Obtain Financials",
    25: "Trading Terms",
    26: "LOI",
    28: "Lease Draft & Review",
    29: "Stalled",
}

# ─── Env loading ──────────────────────────────────────────────────────────────

def load_env(path: Path) -> dict:
    """Parse a .env file and return key→value dict."""
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


# ─── gog helpers ──────────────────────────────────────────────────────────────

def run_gog(args: list[str], capture: bool = True) -> tuple[bool, str]:
    """Run a gog CLI command. Returns (success, stdout)."""
    cmd = [GOG_BIN] + args
    try:
        result = subprocess.run(
            cmd,
            capture_output=capture,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            print(f"[WARN] gog command failed: {' '.join(args)}", file=sys.stderr)
            if result.stderr:
                print(f"       stderr: {result.stderr[:300]}", file=sys.stderr)
            return False, ""
        return True, result.stdout.strip()
    except subprocess.TimeoutExpired:
        print(f"[WARN] gog command timed out: {' '.join(args)}", file=sys.stderr)
        return False, ""
    except Exception as e:
        print(f"[WARN] gog command error: {e}", file=sys.stderr)
        return False, ""


def parse_json_output(raw: str, label: str) -> list | dict | None:
    """Safely parse JSON from gog output."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[WARN] Could not parse JSON from {label}: {e}", file=sys.stderr)
        print(f"       Raw (first 200): {raw[:200]}", file=sys.stderr)
        return None


# ─── 1. Leasing prep doc ──────────────────────────────────────────────────────

def get_latest_prep_doc() -> tuple[str, str]:
    """
    Returns (doc_title, doc_text) for the most recent leasing prep doc.
    Falls back to ("", "") on any error.
    """
    print("[INFO] Fetching Drive folder listing...")
    ok, raw = run_gog([
        "drive", "ls",
        "--parent", DRIVE_FOLDER,
        "--account", GOG_ACCOUNT,
        "--json",
    ])
    if not ok:
        return "", ""

    files = parse_json_output(raw, "Drive ls")
    if not files:
        return "", ""

    # Accept list or dict with 'files' key
    if isinstance(files, dict):
        files = files.get("files", [])

    # Filter to Google Docs only, sort by modifiedTime desc
    docs = [f for f in files if isinstance(f, dict) and
            f.get("mimeType", "") == "application/vnd.google-apps.document"]

    if not docs:
        # Try without MIME filter — maybe different field names
        docs = [f for f in files if isinstance(f, dict)]

    if not docs:
        print("[WARN] No docs found in Drive folder.", file=sys.stderr)
        return "", ""

    # Sort by modifiedTime descending (ISO string sort works fine)
    docs.sort(key=lambda d: d.get("modifiedTime", d.get("modified", "")), reverse=True)
    latest = docs[0]
    doc_id = latest.get("id", latest.get("fileId", ""))
    doc_title = latest.get("name", latest.get("title", "Leasing Prep Doc"))

    if not doc_id:
        print("[WARN] Could not determine doc ID from Drive listing.", file=sys.stderr)
        return doc_title, ""

    print(f"[INFO] Reading doc: {doc_title} ({doc_id})")
    ok, doc_text = run_gog([
        "docs", "get", doc_id,
        "--account", GOG_ACCOUNT,
    ])
    if not ok:
        return doc_title, ""

    return doc_title, doc_text


def parse_prep_doc(doc_text: str) -> dict:
    """
    Parse the leasing prep doc and extract:
      - deal_updates: {deal_name_fragment: {status, nextStep}}
      - priorities: [str]
    
    The prep doc is loosely structured — we do best-effort extraction.
    """
    result = {
        "deal_updates": {},
        "priorities": [],
    }
    if not doc_text:
        return result

    lines = doc_text.splitlines()

    # ── Extract deal blocks ────────────────────────────────────────────────
    # Pattern: deal header lines are typically ALL CAPS or title-cased with property
    # e.g. "FIVE BELOW – MALONE PLAZA" or "Anytime Fitness (Derek Tucker)"
    # followed by Status:, Next Step:, etc.

    current_deal = None
    current_status = []
    current_next = []
    collecting = None  # 'status' | 'next'

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Detect "Status:" label
        if re.match(r'^status\s*:', stripped, re.IGNORECASE):
            collecting = 'status'
            val = re.sub(r'^status\s*:\s*', '', stripped, flags=re.IGNORECASE).strip()
            if val:
                current_status = [val]
            else:
                current_status = []
            continue

        # Detect "Next Step:" or "Next Steps:"
        if re.match(r'^next\s*steps?\s*:', stripped, re.IGNORECASE):
            collecting = 'next'
            val = re.sub(r'^next\s*steps?\s*:\s*', '', stripped, flags=re.IGNORECASE).strip()
            if val:
                current_next = [val]
            else:
                current_next = []
            continue

        # Detect "Priority:" or "Action Items:" — save current deal, reset
        if re.match(r'^(priority|action items?|actions?)\s*:', stripped, re.IGNORECASE):
            collecting = None
            continue

        # Check if this looks like a new deal header:
        # - Short-ish line (< 80 chars)
        # - Doesn't look like a sentence (no period mid-line)
        # - Contains a capital word pattern
        is_deal_header = (
            len(stripped) < 80
            and not stripped.endswith('.')
            and re.search(r'[A-Z][a-z]', stripped)
            and not re.match(r'^(status|next|priority|action|contact|notes?)\s*:', stripped, re.IGNORECASE)
            and not stripped.startswith('-')
            and not stripped.startswith('•')
        )

        if is_deal_header and current_deal is None:
            current_deal = stripped
            current_status = []
            current_next = []
            collecting = None
            continue

        if is_deal_header and current_deal is not None:
            # Save previous deal before starting new one
            if current_deal:
                result["deal_updates"][current_deal] = {
                    "status": " ".join(current_status),
                    "nextStep": " ".join(current_next),
                }
            current_deal = stripped
            current_status = []
            current_next = []
            collecting = None
            continue

        # Accumulate content for current field
        if collecting == 'status' and stripped:
            current_status.append(stripped)
        elif collecting == 'next' and stripped:
            current_next.append(stripped)

    # Save final deal
    if current_deal:
        result["deal_updates"][current_deal] = {
            "status": " ".join(current_status),
            "nextStep": " ".join(current_next),
        }

    # ── Extract priorities ─────────────────────────────────────────────────
    # Look for a "Priorities" or "Action Items" section header, grab bullet lines after
    in_priorities = False
    for line in lines:
        stripped = line.strip()
        if re.match(r'^(weekly\s+)?priorities\b', stripped, re.IGNORECASE):
            in_priorities = True
            continue
        if in_priorities:
            if re.match(r'^\s*[-•*]\s+', stripped) or re.match(r'^\d+\.\s+', stripped):
                item = re.sub(r'^[-•*\d.]\s*', '', stripped).strip()
                if item:
                    result["priorities"].append(item)
            elif stripped and not stripped.startswith('-') and len(result["priorities"]) > 0:
                # Non-bullet line after priorities — we're done with that section
                break

    return result


def match_doc_deal_to_existing(doc_deal_name: str, existing_deals: list) -> dict | None:
    """Fuzzy match a doc deal name to an existing deal in hot-deals.json."""
    doc_lower = doc_deal_name.lower()
    for deal in existing_deals:
        name_lower = deal.get("name", "").lower()
        prop_lower = deal.get("property", "").lower()
        # Check if any significant word from the doc name appears in deal name or property
        words = [w for w in re.split(r'\W+', doc_lower) if len(w) > 3]
        for word in words:
            if word in name_lower or word in prop_lower:
                return deal
    return None


# ─── 2. Calendar ──────────────────────────────────────────────────────────────

def get_today_meetings() -> list[dict]:
    """Fetch today's calendar events and return meeting list."""
    print("[INFO] Fetching today's calendar...")
    ok, raw = run_gog([
        "calendar", "events",
        "--account", GOG_ACCOUNT,
        "--from", "today",
        "--to", "today",
        "--json",
    ])
    if not ok:
        return []

    data = parse_json_output(raw, "Calendar events")
    if not data:
        return []

    # gog may return a list or dict with 'events' key
    events = data if isinstance(data, list) else data.get("events", [])

    meetings = []
    for ev in events:
        if not isinstance(ev, dict):
            continue

        title = ev.get("summary", ev.get("title", "Untitled"))
        start = ev.get("start", {})

        # Parse time from start
        if isinstance(start, dict):
            dt_str = start.get("dateTime", start.get("date", ""))
        else:
            dt_str = str(start)

        time_str = ""
        if dt_str:
            try:
                # Handle ISO format with timezone offset
                dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                # Convert to local time display (just use hour:minute)
                hour = dt.hour
                minute = dt.minute
                ampm = "AM" if hour < 12 else "PM"
                display_hour = hour if hour <= 12 else hour - 12
                if display_hour == 0:
                    display_hour = 12
                time_str = f"{display_hour}:{minute:02d} {ampm}"
            except Exception:
                time_str = dt_str[:10]  # Fall back to date

        # Skip all-day events with no time
        if not time_str and isinstance(start, dict) and "date" in start and "dateTime" not in start:
            continue

        meetings.append({
            "time": time_str,
            "title": title,
            "dealContext": None,
        })

    return meetings


# ─── 3. Greeting ──────────────────────────────────────────────────────────────

def generate_greeting() -> str:
    """Generate a time-appropriate greeting for the current day."""
    now = datetime.now()
    hour = now.hour
    day = now.strftime("%A")  # Monday, Tuesday, etc.

    if hour < 12:
        time_of_day = "morning"
    elif hour < 17:
        time_of_day = "afternoon"
    else:
        time_of_day = "evening"

    return f"Good {time_of_day}, Jacob. Happy {day}."


# ─── 4. Pipedrive funnel ──────────────────────────────────────────────────────

def get_pipedrive_funnel(env: dict) -> dict:
    """Fetch open deals from Pipedrive pipeline 4 and count by stage."""
    token  = env.get("PIPEDRIVE_API_TOKEN", "")
    domain = env.get("PIPEDRIVE_DOMAIN", "")

    if not token or not domain:
        print("[WARN] PIPEDRIVE_API_TOKEN or PIPEDRIVE_DOMAIN not set.", file=sys.stderr)
        return {}

    print("[INFO] Fetching Pipedrive funnel counts...")
    counts = {name: 0 for name in STAGE_MAP.values()}
    start  = 0
    limit  = 500

    while True:
        url = (
            f"https://{domain}/v1/deals"
            f"?pipeline_id=4&status=open&start={start}&limit={limit}"
            f"&api_token={token}"
        )
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                body = json.loads(resp.read().decode())
        except Exception as e:
            print(f"[WARN] Pipedrive API error: {e}", file=sys.stderr)
            break

        data = body.get("data") or []
        if not data:
            break

        for deal in data:
            stage_id = deal.get("stage_id")
            if stage_id in STAGE_MAP:
                counts[STAGE_MAP[stage_id]] += 1

        # Pagination
        more = body.get("additional_data", {}).get("pagination", {}).get("more_items_in_collection", False)
        if not more:
            break
        start += limit

    # Remove zero-count stages that aren't in our map (shouldn't happen, but clean up)
    return {k: v for k, v in counts.items()}


# ─── 5. Merge + write ─────────────────────────────────────────────────────────

def merge_updates(existing: dict, doc_title: str, doc_info: dict,
                  meetings: list, funnel: dict) -> dict:
    """
    Merge live data into the existing hot-deals.json structure.
    PRESERVES: timelines, contacts, actions, droppedBalls, staleContacts, weeklyDiff, brainDumps
    UPDATES: lastUpdated, sourceDoc, today, funnel, deal status/nextStep from prep doc
    """
    updated = json.loads(json.dumps(existing))  # deep copy

    # lastUpdated
    updated["lastUpdated"] = datetime.now().isoformat()

    # sourceDoc
    if doc_title:
        updated["sourceDoc"] = doc_title

    # today section
    today_date = date.today().isoformat()
    updated["today"] = {
        "date": today_date,
        "greeting": generate_greeting(),
        "meetings": meetings if meetings else existing.get("today", {}).get("meetings", []),
        "priorities": (
            doc_info.get("priorities")
            if doc_info.get("priorities")
            else existing.get("today", {}).get("priorities", [])
        ),
    }

    # funnel — merge Pipedrive counts with local "Lease Signed" count
    # (Pipedrive marks signed deals as "won", so we count them locally)
    if funnel:
        lease_signed_count = sum(
            1 for d in updated.get("pipelineDeals", [])
            if (d.get("stageOverride") or d.get("stage", "")) == "Lease Signed"
        )
        funnel["Lease Signed"] = lease_signed_count
        updated["funnel"] = funnel
    else:
        # Even without Pipedrive, keep Lease Signed count accurate
        lease_signed_count = sum(
            1 for d in updated.get("pipelineDeals", [])
            if (d.get("stageOverride") or d.get("stage", "")) == "Lease Signed"
        )
        updated.setdefault("funnel", {})["Lease Signed"] = lease_signed_count

    # Deal status / nextStep from prep doc
    # stageOverride always takes priority — never clobber it with prep doc data
    deal_updates = doc_info.get("deal_updates", {})
    if deal_updates:
        all_deals = updated.get("pipelineDeals", []) + updated.get("sideDeals", [])
        for doc_name, info in deal_updates.items():
            matched = match_doc_deal_to_existing(doc_name, all_deals)
            if matched and (info.get("status") or info.get("nextStep")):
                if info.get("status"):
                    matched["status"] = info["status"]
                if info.get("nextStep"):
                    matched["nextStep"] = info["nextStep"]
                # If the deal has a stageOverride, use it — don't let prep doc clobber it
                if matched.get("stageOverride"):
                    matched["stage"] = matched["stageOverride"]
                    print(f"[INFO] Preserving stageOverride for {matched.get('name', '')}: {matched['stageOverride']}")

    return updated


# ─── 6. Git push ──────────────────────────────────────────────────────────────

def git_push(project_root: Path, message: str = "chore: sync command center data") -> bool:
    """Commit and push hot-deals.json."""
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
            ["git", "commit", "-m", message],
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
    parser = argparse.ArgumentParser(description="Sync Jacob's Command Center data.")
    parser.add_argument("--push",    action="store_true", help="Git commit + push after writing")
    parser.add_argument("--dry-run", action="store_true", help="Print changes, don't write files")
    args = parser.parse_args()

    print(f"[INFO] Starting sync — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Load env and existing data
    env      = load_env(ENV_FILE)
    existing = load_json(DATA_FILE)

    # Gather from all sources (failures are logged but don't abort)
    doc_title, doc_text = get_latest_prep_doc()
    doc_info            = parse_prep_doc(doc_text)
    meetings            = get_today_meetings()
    funnel              = get_pipedrive_funnel(env)

    # Merge
    updated = merge_updates(existing, doc_title, doc_info, meetings, funnel)

    if args.dry_run:
        print("\n[DRY-RUN] Would write the following to hot-deals.json:")
        print(f"  lastUpdated: {updated['lastUpdated']}")
        print(f"  sourceDoc:   {updated.get('sourceDoc', '')}")
        print(f"  today.date:  {updated['today']['date']}")
        print(f"  greeting:    {updated['today']['greeting']}")
        print(f"  meetings:    {len(updated['today']['meetings'])} events")
        print(f"  priorities:  {len(updated['today']['priorities'])} items")
        print(f"  funnel:      {updated.get('funnel', {})}")
        print(f"  deal_updates from doc: {list(doc_info.get('deal_updates', {}).keys())[:5]}")
        print("\n[DRY-RUN] No files written.")
        return

    # Write
    DATA_FILE.write_text(json.dumps(updated, indent=2, ensure_ascii=False))
    print(f"[INFO] Written: {DATA_FILE}")

    if args.push:
        git_push(PROJECT_ROOT, f"chore: sync command center — {date.today().isoformat()}")

    print("[INFO] Sync complete.")


if __name__ == "__main__":
    main()
