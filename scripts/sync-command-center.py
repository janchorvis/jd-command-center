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
import csv
import json
import os
import re
import subprocess
import sys
from datetime import datetime, date, timedelta
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

SUITES_CSV = WORKSPACE_ROOT / "fostr" / "suites.csv"

STAGE_MAP = {
    22: "Contact Made",
    23: "Touring",
    24: "Obtain Financials",
    25: "Trading Terms",
    26: "LOI",
    28: "Lease Draft & Review",
    29: "Stalled",
}

ASANA_BASE = "https://app.asana.com/api/1.0"
ASANA_PROJECT_GID = "1204790859570747"

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


# ─── Asana helpers ────────────────────────────────────────────────────────────

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


def fetch_asana_open_tasks(token: str) -> list[dict]:
    """
    Fetch open tasks from Big Board with due dates.
    Returns all incomplete tasks (caller filters by due date).
    """
    if not token:
        return []
    print("[INFO] Fetching open Asana tasks from Big Board...")
    fields = "name,completed,gid,due_on,assignee.name"
    path = f"/projects/{ASANA_PROJECT_GID}/tasks?opt_fields={fields}&completed_since=now"
    ok, data = asana_request("GET", path, token)
    if not ok:
        return []
    tasks = data.get("data", [])
    open_tasks = [t for t in tasks if not t.get("completed", False)]
    print(f"[INFO] Found {len(open_tasks)} open tasks in Big Board.")
    return open_tasks


def fetch_asana_completed_tasks(token: str) -> list[dict]:
    """
    Fetch tasks completed in the last 7 days from Big Board.
    Used for cross-referencing action items.
    """
    if not token:
        return []
    print("[INFO] Fetching recently completed Asana tasks...")
    seven_days_ago = (date.today() - timedelta(days=7)).isoformat() + "T00:00:00.000Z"
    fields = "name,completed,completed_at,gid"
    path = f"/projects/{ASANA_PROJECT_GID}/tasks?opt_fields={fields}&completed_since={seven_days_ago}"
    ok, data = asana_request("GET", path, token)
    if not ok:
        return []
    tasks = data.get("data", [])
    completed = [t for t in tasks if t.get("completed", False)]
    print(f"[INFO] Found {len(completed)} recently completed Asana tasks.")
    return completed


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
        "docs", "cat", doc_id,
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

        # Filter out intern schedule tracking entries (not real meetings)
        title_lower = title.lower().strip()
        if re.match(r"parker\s*\(", title_lower):
            continue

        meetings.append({
            "time": time_str,
            "title": title,
            "dealContext": None,
        })

    return meetings


# ─── 2b. Meeting enrichment ───────────────────────────────────────────────────

def _build_leasing_context(pipeline_deals: list, side_deals: list,
                            weekly_diff: dict, stale_contacts: list) -> str | None:
    """Build a human-readable context string for a Leasing Meeting."""
    parts = []

    # Total active deal count
    total_active = len(pipeline_deals) + len(side_deals)
    parts.append(f"{total_active} active deals")

    # Deals advanced this week — extract name + new stage from "Name: old → new" items
    advanced = weekly_diff.get("advanced", [])
    if advanced:
        adv_snippets = []
        for item in advanced[:3]:
            name_m  = re.match(r'^([^:]+):', item)
            arrow_m = re.search(r'→\s*(.+)$', item)
            if name_m and arrow_m:
                adv_snippets.append(f"{name_m.group(1).strip()}→{arrow_m.group(1).strip()}")
            elif name_m:
                adv_snippets.append(name_m.group(1).strip())
        adv_str = ", ".join(adv_snippets)
        parts.append(f"{len(advanced)} advanced this week ({adv_str})")

    # Top 3 high-priority deals
    high_priority = [d for d in pipeline_deals + side_deals if d.get("priority") == "high"]
    if high_priority:
        snippets = []
        for d in high_priority[:3]:
            stage = d.get("stageOverride") or d.get("stage", "")
            snippets.append(f"{d.get('name', 'Unknown')} ({stage})")
        parts.append("Top deals: " + ", ".join(snippets))

    # Stale contacts needing attention
    urgent_stale = [c for c in stale_contacts if c.get("urgency") in ("high", "medium")]
    if urgent_stale:
        parts.append(f"{len(urgent_stale)} stale contacts need follow-up")
    elif stale_contacts:
        # Surface the count even if all are low-urgency so Jacob has a heads-up
        parts.append(f"{len(stale_contacts)} contacts tracked")

    return ". ".join(parts) + "." if parts else None


def _build_l10_context(pipeline_deals: list, side_deals: list, weekly_diff: dict) -> str | None:
    """Build a context string for an L10 / Commercial L10 meeting."""
    pieces = []

    advanced  = weekly_diff.get("advanced",  [])
    completed = weekly_diff.get("completed", [])
    stalled   = weekly_diff.get("stalled",   [])

    if advanced:
        pieces.append(f"{len(advanced)} deals advanced")
    if completed:
        pieces.append(f"{len(completed)} completed")
    if stalled:
        pieces.append(f"{len(stalled)} stalled/dropped")

    high_p = [d for d in pipeline_deals + side_deals if d.get("priority") == "high"]
    if high_p:
        pieces.append(f"{len(high_p)} high-priority deals active")

    return "Week scorecard: " + ". ".join(pieces) + "." if pieces else None


def _find_deal_in_title(title: str, all_deals: list) -> dict | None:
    """
    Check if a meeting title contains a known deal name, tenant, or property.
    Returns the first matching deal, or None.
    """
    title_lower = title.lower()
    # Generic words that should never trigger a match
    skip_words = {
        'meeting', 'call', 'with', 'from', 'and', 'the', 'for', 'jacob',
        'anchor', 'delk', 'jack', 'john', 'call', 'chat', 'sync', 'review',
    }

    for deal in all_deals:
        name_words = [
            w.lower() for w in re.split(r'\W+', deal.get("name", ""))
            if len(w) > 3 and w.lower() not in skip_words
        ]
        prop_words = [
            w.lower() for w in re.split(r'\W+', deal.get("property", ""))
            if len(w) > 3 and w.lower() not in skip_words
        ]
        for word in name_words + prop_words:
            if word in title_lower:
                return deal
    return None


def _build_deal_context(deal: dict) -> str | None:
    """Build a short context string for a specific deal."""
    stage     = deal.get("stageOverride") or deal.get("stage", "")
    status    = deal.get("status", "")
    next_step = deal.get("nextStep", "")

    parts = []
    if stage:
        parts.append(f"Stage: {stage}")
    if status:
        # Truncate long status strings
        short = (status[:80] + "…") if len(status) > 80 else status
        parts.append(short)
    if next_step:
        parts.append(f"Next: {next_step}")

    return " | ".join(parts) if parts else None


def enrich_meetings(meetings: list[dict], hot_deals_data: dict) -> list[dict]:
    """
    Enrich each meeting with a human-readable dealContext string pulled from
    hot-deals.json data.  Modifies meetings in place and returns the list.

    Rules:
      - "Leasing Meeting" / "Leasing" title  → full pipeline summary
      - L10 / Commercial L10                 → weekly scorecard
      - Title contains a deal/tenant/property name → that deal's status + next step
      - Everything else                      → dealContext stays None
    """
    if not meetings or not hot_deals_data:
        return meetings

    pipeline_deals  = hot_deals_data.get("pipelineDeals",  [])
    side_deals      = hot_deals_data.get("sideDeals",      [])
    all_deals       = pipeline_deals + side_deals
    weekly_diff     = hot_deals_data.get("weeklyDiff",     {})
    stale_contacts  = hot_deals_data.get("staleContacts",  [])

    for meeting in meetings:
        title       = meeting.get("title", "")
        title_lower = title.lower().strip()

        # ── Leasing Meeting ────────────────────────────────────────────────
        if (
            title_lower in ("leasing", "leasing meeting")
            or "leasing meeting" in title_lower
        ):
            meeting["dealContext"] = _build_leasing_context(
                pipeline_deals, side_deals, weekly_diff, stale_contacts
            )

        # ── L10 / Commercial L10 ───────────────────────────────────────────
        elif re.search(r'\bl10\b', title_lower):
            meeting["dealContext"] = _build_l10_context(
                pipeline_deals, side_deals, weekly_diff
            )

        # ── Deal-name match ────────────────────────────────────────────────
        elif meeting.get("dealContext") is None:
            matched = _find_deal_in_title(title, all_deals)
            if matched:
                meeting["dealContext"] = _build_deal_context(matched)

    return meetings


# ─── 3. Greeting ──────────────────────────────────────────────────────────────

def generate_greeting(
    overdue_count: int = 0,
    meetings: list = None,
    deal_progressed: str = None,
) -> str:
    """
    Generate a contextual greeting based on what's actually happening today.
    Priority order: overdue tasks > deal progression > heavy calendar > default.
    """
    now = datetime.now()
    hour = now.hour
    day = now.strftime("%A")

    if hour < 12:
        time_of_day = "morning"
    elif hour < 17:
        time_of_day = "afternoon"
    else:
        time_of_day = "evening"

    # Overdue tasks — highest urgency
    if overdue_count > 0:
        noun = "item" if overdue_count == 1 else "items"
        return f"Good {time_of_day}, Jacob. You have {overdue_count} overdue {noun}."

    # Deal progressed yesterday
    if deal_progressed:
        return f"Good {time_of_day}, Jacob. {deal_progressed}"

    # Heavy calendar
    meeting_count = len(meetings) if meetings else 0
    if meeting_count >= 4:
        return f"Good {time_of_day}, Jacob. Busy day — {meeting_count} meetings."

    # Default
    return f"Good {time_of_day}, Jacob. Happy {day}."


# ─── 3b. Dynamic priorities & action item cross-ref ──────────────────────────

def parse_prep_doc_date(doc_title: str) -> date | None:
    """
    Try to parse the week date from a prep doc title.
    Handles formats like:
      "Leasing Meeting Prep - Week of 3/9/26"
      "Leasing Meeting Prep - Week of 3/9/2026"
      "Leasing Weekly Prep 3/9/26"
    Returns a date object or None if unparseable.
    """
    if not doc_title:
        return None
    # Match M/D/YY or M/D/YYYY
    m = re.search(r'(\d{1,2})/(\d{1,2})/(\d{2,4})', doc_title)
    if not m:
        return None
    try:
        month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if year < 100:
            year += 2000
        return date(year, month, day)
    except (ValueError, OverflowError):
        return None


def _get_last_timeline_date(deal: dict) -> date | None:
    """Return the most recent timeline event date for a deal."""
    timeline = deal.get("timeline", [])
    if not timeline:
        return None
    dates = []
    for ev in timeline:
        d_str = ev.get("date", "")
        if d_str:
            try:
                dates.append(date.fromisoformat(d_str))
            except ValueError:
                pass
    return max(dates) if dates else None


def _days_since(d: date) -> int:
    """Days since a date."""
    return (date.today() - d).days


def _deal_progressed_yesterday(hot_deals_data: dict) -> str | None:
    """
    Check if any deal had a timeline event yesterday.
    Returns a short description string, or None.
    """
    yesterday = date.today() - timedelta(days=1)

    all_deals = (
        hot_deals_data.get("pipelineDeals", []) +
        hot_deals_data.get("sideDeals", [])
    )
    for deal in all_deals:
        for ev in deal.get("timeline", []):
            try:
                ev_date = date.fromisoformat(ev.get("date", ""))
            except ValueError:
                continue
            if ev_date == yesterday:
                stage = deal.get("stageOverride") or deal.get("stage", "")
                name = deal.get("name", "")
                if name and stage:
                    return f"{name} moved to {stage} yesterday."
    return None


def generate_dynamic_priorities(
    asana_tasks: list,
    meetings: list,
    hot_deals_data: dict,
    doc_info: dict,
    prep_doc_date: date | None,
) -> list[str]:
    """
    Generate priorities dynamically from multiple live sources, ranked by urgency:
    1. Overdue Asana tasks
    2. Tasks due today
    3. Stale high-priority deals (no contact in 5+ days)
    4. Meeting prep items (meetings with deal context)
    5. Prep doc next steps (only if no recent email activity)
    Capped at 8 items.
    """
    today_date = date.today()
    priorities = []

    # Separate overdue vs due-today tasks
    overdue_tasks = []
    due_today_tasks = []
    for task in asana_tasks:
        due_str = task.get("due_on", "")
        if not due_str:
            continue
        try:
            due = date.fromisoformat(due_str)
        except ValueError:
            continue
        if due < today_date:
            overdue_tasks.append(task)
        elif due == today_date:
            due_today_tasks.append(task)

    # 1. Overdue tasks (highest urgency)
    for task in overdue_tasks:
        priorities.append(f"{task['name']} (overdue — due {task['due_on']})")

    # 2. Tasks due today
    for task in due_today_tasks:
        priorities.append(task["name"])

    # 3. Stale high-priority deals
    all_deals = (
        hot_deals_data.get("pipelineDeals", []) +
        hot_deals_data.get("sideDeals", [])
    )
    for deal in all_deals:
        if deal.get("priority") != "high":
            continue
        last_date = _get_last_timeline_date(deal)
        if last_date is None:
            continue
        days_stale = _days_since(last_date)
        if days_stale >= 5:
            name = deal.get("name", "")
            priorities.append(f"Follow up: {name} — no contact in {days_stale} days")

    # 4. Meeting prep items
    for meeting in (meetings or []):
        ctx = meeting.get("dealContext")
        if ctx:
            title = meeting.get("title", "meeting")
            priorities.append(f"Prep: {title} — {ctx[:80]}")

    # 5. Prep doc next steps (only if no recent email activity after the prep doc date)
    if doc_info:
        deal_updates = doc_info.get("deal_updates", {})
        for doc_name, info in deal_updates.items():
            next_step = info.get("nextStep", "").strip()
            if not next_step:
                continue
            # Find the matching deal
            matched = match_doc_deal_to_existing(doc_name, all_deals)
            if not matched:
                continue
            # Only include if no timeline activity after prep doc date
            last_date = _get_last_timeline_date(matched)
            if prep_doc_date and last_date and last_date > prep_doc_date:
                continue  # Deal has been acted on — skip
            deal_name = matched.get("name", doc_name)
            priorities.append(f"{deal_name}: {next_step}")

    # Cap at 8
    return priorities[:8]


def cross_reference_action_items(action_items: list, completed_tasks: list) -> list[dict]:
    """
    Cross-reference action items with recently completed Asana tasks.
    If an action item fuzzy-matches a completed task name, mark it completed: true.
    """
    if not action_items or not completed_tasks:
        return action_items

    completed_names = [t.get("name", "").lower() for t in completed_tasks]

    result = []
    for item in action_items:
        item_copy = dict(item)
        title = item.get("title", "").lower()

        # Extract significant keywords (len > 3, skip common words)
        skip = {"with", "from", "that", "this", "have", "been", "will", "just",
                 "like", "them", "they", "what", "when", "then", "than", "some"}
        keywords = [w for w in re.split(r'\W+', title) if len(w) > 3 and w not in skip]

        if keywords:
            for completed_name in completed_names:
                # Check if any keyword appears in completed task name
                if any(kw in completed_name for kw in keywords):
                    item_copy["completed"] = True
                    break

        result.append(item_copy)

    return result


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


# ─── 5. Rent comp enrichment ──────────────────────────────────────────────────

def _normalize_prop(name: str) -> str:
    """Lowercase + strip for fuzzy property matching."""
    return re.sub(r'\s+', ' ', name.lower().strip())


def _props_match(deal_prop: str, suite_prop: str) -> bool:
    """
    Return True if deal_prop and suite_prop refer to the same property.
    Strategy (in order):
      1. Exact match after normalization
      2. Either is a substring of the other
      3. Token overlap — any non-trivial token (len > 3) present in both
    """
    dp = _normalize_prop(deal_prop)
    sp = _normalize_prop(suite_prop)

    if dp == sp:
        return True
    if sp in dp or dp in sp:
        return True

    # Token overlap
    dp_tokens = set(t for t in re.split(r'\W+', dp) if len(t) > 3)
    sp_tokens = set(t for t in re.split(r'\W+', sp) if len(t) > 3)
    if dp_tokens and sp_tokens and dp_tokens & sp_tokens:
        return True

    return False


def load_suite_comps() -> dict:
    """
    Load suites.csv and return a dict keyed by normalized property name:
      {
        "malone": {
          "property": "Malone",         # original name from CSV
          "suites": [...],               # all suite rows for this property
        },
        ...
      }
    """
    if not SUITES_CSV.exists():
        print(f"[WARN] suites.csv not found at {SUITES_CSV}", file=sys.stderr)
        return {}

    by_prop: dict = {}
    with open(SUITES_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            prop = (row.get("property") or "").strip()
            if not prop:
                continue
            key = _normalize_prop(prop)
            if key not in by_prop:
                by_prop[key] = {"property": prop, "suites": []}
            by_prop[key]["suites"].append(row)

    return by_prop


def calc_rent_comps(suites: list[dict], property_name: str) -> dict | None:
    """
    Calculate rent comp stats for a list of suite rows.
    Returns a rentComps dict, or None if no usable rate data.
    """
    rates = []
    sq_fts = []
    total_count = len(suites)
    vacant_count = 0

    for s in suites:
        # Vacancy: status != "Active" counts as vacant
        status = (s.get("status") or "").strip()
        if status.lower() != "active":
            vacant_count += 1

        # Square footage
        try:
            sf = float(s.get("square_feet") or 0)
            if sf > 0:
                sq_fts.append(sf)
        except (ValueError, TypeError):
            pass

        # Rate — skip empty or zero
        try:
            rate = float(s.get("market_rent_psf") or 0)
            if rate > 0:
                rates.append(rate)
        except (ValueError, TypeError):
            pass

    if not rates:
        # No rate data for this property — still return basic suite stats
        # so the card shows something useful (suite count, sq ft)
        if not sq_fts and total_count == 0:
            return None
        return {
            "property": property_name,
            "avgRate": None,
            "minRate": None,
            "maxRate": None,
            "avgSqFt": round(sum(sq_fts) / len(sq_fts)) if sq_fts else None,
            "suiteCount": total_count,
            "vacantCount": vacant_count,
        }

    avg_sq_ft = round(sum(sq_fts) / len(sq_fts)) if sq_fts else None

    return {
        "property": property_name,
        "avgRate": round(sum(rates) / len(rates), 2),
        "minRate": round(min(rates), 2),
        "maxRate": round(max(rates), 2),
        "avgSqFt": avg_sq_ft,
        "suiteCount": total_count,
        "vacantCount": vacant_count,
    }


def enrich_rent_comps(hot_deals_data: dict) -> dict:
    """
    Add rentComps to each pipeline/side deal whose property matches a suite in suites.csv.
    Mutates hot_deals_data in place and returns it.
    """
    suite_data = load_suite_comps()
    if not suite_data:
        print("[WARN] No suite data loaded — skipping rent comp enrichment.", file=sys.stderr)
        return hot_deals_data

    enriched = 0
    all_deals = (
        hot_deals_data.get("pipelineDeals", []) +
        hot_deals_data.get("sideDeals", [])
    )

    for deal in all_deals:
        deal_prop = (deal.get("property") or "").strip()
        if not deal_prop:
            continue

        # Find matching property in suite data
        matched_key = None
        for suite_key, suite_info in suite_data.items():
            if _props_match(deal_prop, suite_info["property"]):
                matched_key = suite_key
                break

        if matched_key is None:
            continue

        suite_info = suite_data[matched_key]
        comps = calc_rent_comps(suite_info["suites"], suite_info["property"])
        if comps:
            deal["rentComps"] = comps
            enriched += 1
            print(f"[INFO] Rent comps added for '{deal.get('name', '')}' → {suite_info['property']} "
                  f"(suites: {comps['suiteCount']}, rate: {comps.get('avgRate', 'N/A')} PSF)")

    print(f"[INFO] Rent comp enrichment: {enriched}/{len(all_deals)} deals matched.")
    return hot_deals_data


# ─── 6. Merge + write ─────────────────────────────────────────────────────────

def merge_updates(
    existing: dict,
    doc_title: str,
    doc_info: dict,
    meetings: list,
    funnel: dict,
    asana_tasks: list = None,
    completed_tasks: list = None,
    prep_doc_date: date | None = None,
) -> dict:
    """
    Merge live data into the existing hot-deals.json structure.
    PRESERVES: timelines, contacts, actions, droppedBalls, staleContacts, weeklyDiff, brainDumps
    UPDATES: lastUpdated, sourceDoc, today, funnel, deal status/nextStep, actionItems freshness
    """
    asana_tasks     = asana_tasks or []
    completed_tasks = completed_tasks or []

    updated = json.loads(json.dumps(existing))  # deep copy

    # lastUpdated
    updated["lastUpdated"] = datetime.now().isoformat()

    # sourceDoc
    if doc_title:
        updated["sourceDoc"] = doc_title

    # ── Funnel ────────────────────────────────────────────────────────────────
    # funnel — merge Pipedrive counts with local "Lease Signed" count
    # (Pipedrive marks signed deals as "won", so we count them locally)
    lease_signed_count = sum(
        1 for d in updated.get("pipelineDeals", [])
        if (d.get("stageOverride") or d.get("stage", "")) == "Lease Signed"
    )
    if funnel:
        funnel["Lease Signed"] = lease_signed_count
        updated["funnel"] = funnel
    else:
        updated.setdefault("funnel", {})["Lease Signed"] = lease_signed_count

    # ── Deal status / nextStep — with freshness check ─────────────────────────
    # stageOverride always takes priority — never clobber it with prep doc data
    deal_updates = doc_info.get("deal_updates", {})
    if deal_updates:
        all_deals = updated.get("pipelineDeals", []) + updated.get("sideDeals", [])
        for doc_name, info in deal_updates.items():
            matched = match_doc_deal_to_existing(doc_name, all_deals)
            if not matched:
                continue

            # Check timeline freshness vs prep doc date
            last_timeline = _get_last_timeline_date(matched)
            has_recent_activity = (
                prep_doc_date is not None
                and last_timeline is not None
                and last_timeline > prep_doc_date
            )

            if info.get("status"):
                if has_recent_activity:
                    # Deal has been updated since the prep doc — keep existing status
                    # but mark it "current" so the UI knows it's fresh
                    matched.setdefault("statusFreshness", "current")
                    print(f"[INFO] Skipping prep doc status for '{matched.get('name','')}' "
                          f"— timeline is more recent ({last_timeline} > {prep_doc_date})")
                else:
                    matched["status"] = info["status"]
                    matched["statusFreshness"] = "from_prep_doc"

            if info.get("nextStep"):
                # Always update nextStep from prep doc (unless there's very recent activity
                # suggesting the next step was already acted on)
                if not has_recent_activity:
                    matched["nextStep"] = info["nextStep"]

            # Preserve stageOverride
            if matched.get("stageOverride"):
                matched["stage"] = matched["stageOverride"]
                print(f"[INFO] Preserving stageOverride for {matched.get('name', '')}: {matched['stageOverride']}")

    # ── Enrich meetings first (needs deal data in `updated`) ─────────────────
    raw_meetings = meetings if meetings else existing.get("today", {}).get("meetings", [])
    enriched_meetings = enrich_meetings(list(raw_meetings), updated)

    # ── Compute overdue count for greeting ────────────────────────────────────
    today_date = date.today()
    overdue_tasks = [
        t for t in asana_tasks
        if not t.get("completed", False) and t.get("due_on")
        and date.fromisoformat(t["due_on"]) < today_date
    ]
    overdue_count = len(overdue_tasks)

    # Check if any deal progressed yesterday (for greeting context)
    deal_progressed_msg = _deal_progressed_yesterday(updated)

    # ── Dynamic priorities ─────────────────────────────────────────────────────
    dynamic_priorities = generate_dynamic_priorities(
        asana_tasks=asana_tasks,
        meetings=enriched_meetings,
        hot_deals_data=updated,
        doc_info=doc_info,
        prep_doc_date=prep_doc_date,
    )

    # Fall back to prep doc priorities if we got nothing dynamic
    if not dynamic_priorities:
        dynamic_priorities = (
            doc_info.get("priorities")
            or existing.get("today", {}).get("priorities", [])
        )

    # ── today section ─────────────────────────────────────────────────────────
    updated["today"] = {
        "date": today_date.isoformat(),
        "greeting": generate_greeting(
            overdue_count=overdue_count,
            meetings=enriched_meetings,
            deal_progressed=deal_progressed_msg,
        ),
        "meetings": enriched_meetings,
        "priorities": dynamic_priorities,
    }

    # ── Action items freshness: cross-reference with completed Asana tasks ────
    existing_action_items = updated.get("actionItems", [])
    if existing_action_items and completed_tasks:
        updated["actionItems"] = cross_reference_action_items(
            existing_action_items, completed_tasks
        )

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


# ─── Focus 3 Generation ──────────────────────────────────────────────────────
#
# Focus 3 is a VISUALIZATION layer, not a brain. The morning briefing cron
# already synthesizes priorities from active-tasks, Asana, Calendar, email
# triage, and deal priorities. Focus 3 just displays the top 3 from
# YOUR PLATE. Falls back to active-tasks.md if no briefing available.
#

def _load_briefing_cache() -> str:
    """Load today's briefing from cache file. Returns raw text or empty string."""
    briefing_cache = WORKSPACE_ROOT / "memory" / "system" / "latest-briefing.txt"
    if briefing_cache.exists():
        try:
            content = briefing_cache.read_text()
            if date.today().isoformat() in content[:30]:
                return content
        except Exception:
            pass
    return ""


def _parse_briefing_sections(summary: str) -> dict:
    """
    Parse all sections from a morning briefing.
    Returns dict with keys: your_plate, prepping, handling, deferred
    Each is a list of {rank, text, dealName, action}
    """
    sections = {
        "your_plate": [],
        "prepping": [],
        "handling": [],
        "deferred": [],
    }

    # Section detection patterns
    SECTION_MAP = {
        r"YOUR PLATE\s*\(\d+\)": "your_plate",
        r"I'LL PREP\s*\(\d+\)": "prepping",
        r"I'M HANDLING\s*\(\d+\)": "handling",
        r"DEFERRED\s*\(\d+\)": "deferred",
    }

    current_section = None
    for line in summary.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        # Check if this line starts a new section
        for pattern, section_key in SECTION_MAP.items():
            if re.match(pattern, stripped):
                current_section = section_key
                break
        else:
            # Check for end-of-sections markers
            if stripped.startswith("⚠️") or stripped.startswith("Note:") or stripped.startswith("Reply"):
                current_section = None
                continue

            if current_section:
                m = re.match(r"(\d+)\.\s+(.+)", stripped)
                if m:
                    rank = int(m.group(1))
                    text = m.group(2).strip()
                    parts = re.split(r"\s*[—–]\s*", text, maxsplit=1)
                    deal_name = parts[0].strip()[:60]
                    action = parts[1].strip() if len(parts) > 1 else text
                    sections[current_section].append({
                        "rank": rank,
                        "text": text,
                        "dealName": deal_name,
                        "action": action,
                    })
                elif current_section == "deferred" and stripped:
                    # Deferred is often a comma-separated list, not numbered
                    sections["deferred"].append({
                        "rank": len(sections["deferred"]) + 1,
                        "text": stripped,
                        "dealName": stripped[:60],
                        "action": stripped,
                    })

    return sections


def _fallback_active_tasks() -> list:
    """
    Fallback: read active-tasks.md and return non-waiting This Week items.
    """
    tasks_file = WORKSPACE_ROOT / "memory" / "active-tasks.md"
    if not tasks_file.exists():
        return []

    content = tasks_file.read_text()
    items = []
    in_this_week = False
    rank = 0

    for line in content.splitlines():
        if "### This Week" in line:
            in_this_week = True
            continue
        if in_this_week and line.startswith("### "):
            break
        if in_this_week and line.strip().startswith("- T"):
            if "[waiting on:" in line.lower():
                continue
            m = re.match(r"- T\d+: (.+?)(?:\s*\[|$)", line.strip())
            if m:
                rank += 1
                text = m.group(1).strip().rstrip(".")
                parts = re.split(r"\s*[—–]\s*", text, maxsplit=1)
                deal_name = parts[0].strip()[:60]
                action = parts[1].strip() if len(parts) > 1 else text
                items.append({
                    "rank": rank,
                    "dealName": deal_name,
                    "action": action,
                    "text": text,
                })
    return items


def generate_focus3_and_sweep(data: dict) -> tuple:
    """
    Generate both Focus 3 AND todaySweep from the morning briefing.
    Both are visualization layers - the briefing already decided what matters.

    Returns (focus3_dict, sweep_dict).
    Falls back to active-tasks.md if no briefing is available today.
    """
    briefing_text = _load_briefing_cache()
    source = "morning-briefing" if briefing_text else "active-tasks"

    if briefing_text:
        sections = _parse_briefing_sections(briefing_text)
        plate_items = sections["your_plate"]
        prepping_items = sections["prepping"]
        handling_items = sections["handling"]
        deferred_items = sections["deferred"]
        print(f"[INFO] Briefing loaded: {len(plate_items)} plate, "
              f"{len(prepping_items)} prepping, {len(handling_items)} handling, "
              f"{len(deferred_items)} deferred")
    else:
        print("[INFO] No briefing available, falling back to active-tasks.md")
        plate_items = _fallback_active_tasks()
        prepping_items = []
        handling_items = []
        deferred_items = []

    # ── Focus 3: top 3 from YOUR PLATE ────────────────────────────────────────
    top3 = []
    for item in plate_items[:3]:
        action = item["action"]
        if len(action) > 140:
            action = action[:137] + "..."

        top3.append({
            "id": f"focus-plate-{item['rank']}",
            "dealName": item["dealName"],
            "property": None,
            "action": action,
            "why": f"#{item['rank']} on your plate today." if source == "morning-briefing" else "Top of your active task list this week.",
            "urgency": "high" if item["rank"] <= 2 else "medium",
            "type": "briefing" if source == "morning-briefing" else "task",
        })

    focus3 = {
        "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "source": source,
        "items": top3,
    }

    print(f"[INFO] Focus 3: {len(top3)} items")
    for item in top3:
        print(f"  · {item['dealName']} — {item['action'][:60]}")

    # ── todaySweep: full briefing sections ────────────────────────────────────
    def _items_to_sweep(items: list, prefix: str) -> list:
        return [{
            "id": f"{prefix}-{item['rank']}",
            "text": item["text"],
            "detail": "",
            "completed": False,
            "source": source,
        } for item in items]

    sweep = {
        "generatedAt": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "source": source,
        "yourPlate": _items_to_sweep(plate_items, "sweep-plate"),
        "prepping": _items_to_sweep(prepping_items, "sweep-prep"),
        "handling": _items_to_sweep(handling_items, "sweep-handle"),
        "deferred": _items_to_sweep(deferred_items, "sweep-defer"),
    }

    print(f"[INFO] Sweep: {len(sweep['yourPlate'])} plate, {len(sweep['prepping'])} prepping, "
          f"{len(sweep['handling'])} handling, {len(sweep['deferred'])} deferred")

    return focus3, sweep


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync Jacob's Command Center data.")
    parser.add_argument("--push",       action="store_true", help="Git commit + push after writing")
    parser.add_argument("--dry-run",    action="store_true", help="Print changes, don't write files")
    parser.add_argument("--focus3-only", action="store_true", help="Only regenerate focus3, skip heavy API calls")
    args = parser.parse_args()

    print(f"[INFO] Starting sync — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # Load env and existing data
    env      = load_env(ENV_FILE)
    existing = load_json(DATA_FILE)

    # ── focus3-only fast path ─────────────────────────────────────────────────
    if args.focus3_only:
        print("[INFO] --focus3-only: regenerating focus3 + sweep from briefing...")
        focus3, sweep = generate_focus3_and_sweep(existing)
        existing["focus3"] = focus3
        existing["todaySweep"] = sweep
        if not args.dry_run:
            DATA_FILE.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
            print(f"[INFO] Written: {DATA_FILE}")
        if args.push:
            git_push(PROJECT_ROOT, f"chore: regenerate focus3 + sweep — {date.today().isoformat()}")
        print("[INFO] Focus3 + Sweep update complete.")
        return

    # Load Asana token from env
    asana_token = env.get("ASANA_TOKEN", "")
    if not asana_token:
        print("[WARN] ASANA_TOKEN not found in .env — Asana features disabled.", file=sys.stderr)

    # Gather from all sources (failures are logged but don't abort)
    doc_title, doc_text = get_latest_prep_doc()
    doc_info            = parse_prep_doc(doc_text)
    meetings            = get_today_meetings()
    funnel              = get_pipedrive_funnel(env)

    # Asana: open tasks (for dynamic priorities) + completed tasks (for action item freshness)
    asana_open_tasks  = fetch_asana_open_tasks(asana_token) if asana_token else []
    completed_tasks   = fetch_asana_completed_tasks(asana_token) if asana_token else []

    # Parse prep doc date so we can determine status freshness
    prep_doc_date = parse_prep_doc_date(doc_title)
    if prep_doc_date:
        print(f"[INFO] Prep doc date parsed: {prep_doc_date}")
    else:
        print("[WARN] Could not parse prep doc date from title — status freshness check disabled.")

    # Merge
    updated = merge_updates(
        existing, doc_title, doc_info, meetings, funnel,
        asana_tasks=asana_open_tasks,
        completed_tasks=completed_tasks,
        prep_doc_date=prep_doc_date,
    )

    # Enrich with rent comp data from suites.csv
    updated = enrich_rent_comps(updated)

    # Generate Focus 3 + Morning Sweep from briefing
    focus3, sweep = generate_focus3_and_sweep(updated)
    updated["focus3"] = focus3
    updated["todaySweep"] = sweep

    if args.dry_run:
        print("\n[DRY-RUN] Would write the following to hot-deals.json:")
        print(f"  lastUpdated: {updated['lastUpdated']}")
        print(f"  sourceDoc:   {updated.get('sourceDoc', '')}")
        print(f"  prep_doc_date: {prep_doc_date}")
        print(f"  today.date:  {updated['today']['date']}")
        print(f"  greeting:    {updated['today']['greeting']}")
        print(f"  meetings:    {len(updated['today']['meetings'])} events")
        for m in updated['today']['meetings']:
            ctx = m.get('dealContext')
            marker = "✓" if ctx else " "
            print(f"    [{marker}] {m.get('time', '?'):8s}  {m.get('title', '')}")
            if ctx:
                print(f"           → {ctx}")
        today_date_val = date.today()
        overdue = [t for t in asana_open_tasks if t.get("due_on") and date.fromisoformat(t["due_on"]) < today_date_val]
        due_today = [t for t in asana_open_tasks if t.get("due_on") and date.fromisoformat(t["due_on"]) == today_date_val]
        print(f"  asana open tasks: {len(asana_open_tasks)} total, {len(overdue)} overdue, {len(due_today)} due today")
        print(f"  asana completed (7d): {len(completed_tasks)} tasks")
        print(f"  priorities ({len(updated['today']['priorities'])} items, dynamic):")
        for p in updated['today']['priorities']:
            print(f"    · {p}")
        print(f"  funnel:      {updated.get('funnel', {})}")
        print(f"  deal_updates from doc: {list(doc_info.get('deal_updates', {}).keys())[:5]}")
        # Action items freshness
        completed_action_items = [ai for ai in updated.get("actionItems", []) if ai.get("completed")]
        print(f"  actionItems: {len(updated.get('actionItems',[]))} total, {len(completed_action_items)} marked completed")
        # Show rent comp summary
        all_deals = updated.get("pipelineDeals", []) + updated.get("sideDeals", [])
        enriched = [(d.get("name","?"), d["rentComps"]) for d in all_deals if "rentComps" in d]
        print(f"  rentComps enriched:    {len(enriched)}/{len(all_deals)} deals")
        for name, rc in enriched:
            rate_str = f"${rc['avgRate']} PSF avg" if rc.get("avgRate") else "no rate data"
            print(f"    · {name} → {rc['property']} ({rc['suiteCount']} suites, {rate_str})")
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
