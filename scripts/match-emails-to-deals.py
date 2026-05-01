#!/usr/bin/env python3
from __future__ import annotations
"""
match-emails-to-deals.py
Scans Jacob's recent Gmail and matches emails to deals in hot-deals.json.
Adds timeline entries, updates staleContacts, and flags unread matched emails.

Usage:
  python3 match-emails-to-deals.py                 # Default: last 7 days
  python3 match-emails-to-deals.py --days 14       # Extend lookback window
  python3 match-emails-to-deals.py --push          # Write + git push
  python3 match-emails-to-deals.py --dry-run       # Print matches, don't write
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, date, timedelta
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────

WORKSPACE_ROOT = Path("/Users/fostercreighton/.openclaw/workspace")
PROJECT_ROOT   = WORKSPACE_ROOT / "jd-command-center"
DATA_FILE      = PROJECT_ROOT / "data" / "hot-deals.json"
ENV_FILE       = WORKSPACE_ROOT / ".env"
GOG_BIN        = "/opt/homebrew/bin/gog"
GOG_ACCOUNT    = "jdelk@anchorinv.com"

# Days-since-last-contact thresholds for "stale" classification
STALE_THRESHOLDS = {
    "high":   7,   # high priority deals: stale after 7 days
    "medium": 14,  # medium priority deals: stale after 14 days
    "low":    21,
}

# ─── Stage signal detection ────────────────────────────────────────────────────

# Keywords in email subject/snippet that indicate a stage advancement
STAGE_SIGNALS: dict[str, list[str]] = {
    "Lease Signed": [
        "complete with docusign",
        "fully executed",
        "lease signed",
        "lease executed",
        "completed: complete",
        "signing complete",
        "all parties signed",
    ],
    "LOI": [
        "loi signed",
        "loi executed",
        "letter of intent signed",
        "loi fully executed",
    ],
    "Lease Draft & Review": [
        "lease draft attached",
        "draft lease for review",
        "lease sent for review",
        "please review the attached lease",
    ],
    "Touring": [
        "tour scheduled",
        "showing confirmed",
        "tour confirmation",
        "site visit scheduled",
    ],
}

# Forward-only ordering — only advance stages, never regress
STAGE_ORDER = [
    "Contact Made",
    "Touring",
    "Obtain Financials",
    "Trading Terms",
    "LOI",
    "Lease Draft & Review",
    "Lease Signed",
]


def stage_index(stage: str) -> int:
    """Return the position of a stage in the pipeline. Returns -1 if unknown."""
    try:
        return STAGE_ORDER.index(stage)
    except ValueError:
        return -1


def detect_stage_signal(email: dict) -> tuple[str, str] | None:
    """
    Scan email subject + snippet for stage-advancing keywords.
    Returns (detected_stage, matched_phrase) or None.
    """
    haystack = " ".join([
        email.get("subject", ""),
        email.get("snippet", ""),
    ]).lower()

    for stage, phrases in STAGE_SIGNALS.items():
        for phrase in phrases:
            if phrase.lower() in haystack:
                return stage, phrase
    return None

# ─── Helpers ──────────────────────────────────────────────────────────────────

def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def run_gog(args: list[str]) -> tuple[bool, str]:
    cmd = [GOG_BIN] + args
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            print(f"[WARN] gog failed: {' '.join(args[:4])}", file=sys.stderr)
            if result.stderr:
                print(f"       {result.stderr[:300]}", file=sys.stderr)
            return False, ""
        return True, result.stdout.strip()
    except subprocess.TimeoutExpired:
        print(f"[WARN] gog timed out: {' '.join(args[:4])}", file=sys.stderr)
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


# ─── Email fetching ───────────────────────────────────────────────────────────

def fetch_emails(days: int) -> list[dict]:
    """Fetch inbox + sent emails from the past N days. Returns a deduplicated list."""
    queries = [
        f"newer_than:{days}d",
        f"in:sent newer_than:{days}d",
    ]

    all_emails: dict[str, dict] = {}  # message_id → email dict

    for query in queries:
        label = "inbox" if "sent" not in query else "sent"
        print(f"[INFO] Fetching {label} emails: {query}")
        ok, raw = run_gog([
            "gmail", "search", query,
            "--account", GOG_ACCOUNT,
            "--json",
            "--limit", "50",
        ])
        if not ok:
            continue

        data = parse_json_output(raw, f"Gmail {label}")
        if not data:
            continue

        # gog may return list or dict with 'messages' key
        msgs = data if isinstance(data, list) else data.get("messages", data.get("threads", []))

        for msg in msgs:
            if not isinstance(msg, dict):
                continue
            msg_id = msg.get("id", msg.get("messageId", ""))
            if msg_id and msg_id not in all_emails:
                all_emails[msg_id] = msg

    emails = list(all_emails.values())
    print(f"[INFO] Fetched {len(emails)} unique emails.")
    return emails


# ─── Deal extraction ──────────────────────────────────────────────────────────

def get_all_deals(data: dict) -> list[dict]:
    """Return all pipeline + side deals."""
    return data.get("pipelineDeals", []) + data.get("sideDeals", [])


def get_deal_keywords(deal: dict) -> set[str]:
    """Extract searchable keywords from a deal."""
    keywords = set()

    def add_words(text: str):
        if not text:
            return
        # Add the full phrase (lowercased)
        keywords.add(text.lower())
        # Also add individual significant words (4+ chars)
        for word in re.split(r'\W+', text.lower()):
            if len(word) >= 4:
                keywords.add(word)

    add_words(deal.get("name", ""))
    add_words(deal.get("property", ""))

    for contact in deal.get("contacts", []):
        # Extract just the name part (before parenthetical)
        name = re.sub(r'\s*\(.*?\)', '', contact).strip()
        add_words(name)
        # Also add last name alone if it's long enough
        parts = name.split()
        if parts:
            add_words(parts[-1])

    return keywords


def email_matches_deal(email: dict, deal_keywords: set[str]) -> bool:
    """Return True if any deal keyword appears in the email's from/to/subject/snippet."""
    # Build searchable text blob from email fields
    fields = [
        email.get("subject", ""),
        email.get("snippet", ""),
        email.get("from", ""),
        email.get("to", ""),
        email.get("sender", ""),
        email.get("recipients", ""),
    ]
    # Handle nested structures
    frm = email.get("from", {})
    if isinstance(frm, dict):
        fields.append(frm.get("name", ""))
        fields.append(frm.get("email", ""))

    haystack = " ".join(str(f) for f in fields if f).lower()

    for kw in deal_keywords:
        if kw in haystack:
            return True
    return False


def extract_email_date(email: dict) -> str:
    """Return ISO date string from email, or today's date as fallback."""
    # Try common date fields
    for field in ("date", "internalDate", "receivedDate", "timestamp"):
        val = email.get(field)
        if not val:
            continue
        # internalDate is often epoch milliseconds
        if isinstance(val, (int, float)):
            try:
                dt = datetime.fromtimestamp(val / 1000 if val > 1e10 else val)
                return dt.date().isoformat()
            except Exception:
                continue
        if isinstance(val, str):
            # Try ISO parse
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                return dt.date().isoformat()
            except Exception:
                pass
            # Try RFC 2822 partial (e.g. "Thu, 12 Mar 2026 ...")
            m = re.search(r'(\d{1,2})\s+(\w{3})\s+(\d{4})', val)
            if m:
                try:
                    dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %b %Y")
                    return dt.date().isoformat()
                except Exception:
                    pass

    return date.today().isoformat()


def build_timeline_event(email: dict) -> dict:
    """Build a timeline entry from an email."""
    subject = email.get("subject", "(no subject)")[:80]
    sender_raw = email.get("from", "")
    if isinstance(sender_raw, dict):
        sender_name = sender_raw.get("name", sender_raw.get("email", "Unknown"))
    else:
        # Try to extract "Name <email>" format
        m = re.match(r'^"?([^"<]+)"?\s*<', str(sender_raw))
        sender_name = m.group(1).strip() if m else str(sender_raw).split("<")[0].strip() or "Unknown"

    event_text = f"Email from {sender_name}: {subject}"
    return {
        "date": extract_email_date(email),
        "event": event_text,
        "type": "email",
    }


def timeline_event_exists(timeline: list[dict], event_text: str, event_date: str) -> bool:
    """Avoid adding duplicate timeline entries."""
    for entry in timeline:
        if entry.get("date") == event_date and entry.get("event") == event_text:
            return True
        # Also check if the same subject line appears on the same date
        # (handles minor text variations)
        if entry.get("date") == event_date:
            existing = entry.get("event", "").lower()
            new = event_text.lower()
            # If 70% of words overlap, treat as duplicate
            existing_words = set(existing.split())
            new_words = set(new.split())
            if existing_words and len(existing_words & new_words) / len(existing_words) > 0.7:
                return True
    return False


# ─── Stale contact analysis ───────────────────────────────────────────────────

def compute_stale_contacts(data: dict) -> list[dict]:
    """
    For each deal, find the most recent email-type timeline event and
    flag the deal's contacts as stale if it's been too long.
    """
    today_dt = date.today()
    stale = []

    for deal in get_all_deals(data):
        priority = deal.get("priority", "medium")
        threshold = STALE_THRESHOLDS.get(priority, 14)

        # Find most recent email event in timeline
        timeline = deal.get("timeline", [])
        email_events = [e for e in timeline if e.get("type") == "email"]

        if not email_events:
            # No email history at all — flag as stale if deal has contacts
            for contact_raw in deal.get("contacts", []):
                contact = re.sub(r'\s*\(.*?\)', '', contact_raw).strip()
                deal_label = f"{deal.get('name', '')} — {deal.get('property', '')}"
                stale.append({
                    "name": contact,
                    "deal": deal_label,
                    "daysSinceContact": 999,
                    "lastAction": "No email history found",
                    "urgency": "high" if priority == "high" else "medium",
                })
            continue

        # Sort by date desc
        email_events.sort(key=lambda e: e.get("date", ""), reverse=True)
        latest = email_events[0]
        latest_date_str = latest.get("date", "")

        try:
            latest_date = date.fromisoformat(latest_date_str)
            days_since = (today_dt - latest_date).days
        except Exception:
            days_since = 0

        is_stale = days_since > threshold

        if is_stale:
            urgency = "high" if days_since > threshold * 2 else "medium"
            if priority == "high" and days_since > threshold:
                urgency = "high"

            for contact_raw in deal.get("contacts", []):
                contact = re.sub(r'\s*\(.*?\)', '', contact_raw).strip()
                deal_label = f"{deal.get('name', '')} — {deal.get('property', '')}"
                stale.append({
                    "name": contact,
                    "deal": deal_label,
                    "daysSinceContact": days_since,
                    "lastAction": latest.get("event", "")[:80],
                    "urgency": urgency,
                })
        else:
            # Not stale — include as low urgency for dashboard awareness
            for contact_raw in deal.get("contacts", []):
                contact = re.sub(r'\s*\(.*?\)', '', contact_raw).strip()
                deal_label = f"{deal.get('name', '')} — {deal.get('property', '')}"
                stale.append({
                    "name": contact,
                    "deal": deal_label,
                    "daysSinceContact": days_since,
                    "lastAction": latest.get("event", "")[:80],
                    "urgency": "low",
                })

    # Sort: high first, then by days desc
    urgency_order = {"high": 0, "medium": 1, "low": 2}
    stale.sort(key=lambda x: (urgency_order.get(x["urgency"], 3), -x["daysSinceContact"]))

    return stale


# ─── Main matching logic ───────────────────────────────────────────────────────

def match_and_update(data: dict, emails: list[dict], dry_run: bool = False) -> dict:
    """
    Match emails to deals, insert timeline entries, recompute staleContacts.
    Returns the updated data dict.
    """
    updated = json.loads(json.dumps(data))  # deep copy

    total_matches = 0
    unread_matches = []

    all_deals = updated.get("pipelineDeals", []) + updated.get("sideDeals", [])

    for deal in all_deals:
        keywords = get_deal_keywords(deal)
        timeline = deal.setdefault("timeline", [])

        for email in emails:
            if not email_matches_deal(email, keywords):
                continue

            event = build_timeline_event(email)
            event_text = event["event"]
            event_date = event["date"]

            if timeline_event_exists(timeline, event_text, event_date):
                continue  # skip duplicate

            if dry_run:
                deal_name = f"{deal.get('name')} ({deal.get('property')})"
                print(f"  [MATCH] Deal: {deal_name}")
                print(f"          Email: {event_text}")
                print(f"          Date:  {event_date}")
            else:
                # Insert at front (most recent first) or sort after
                timeline.insert(0, event)

            total_matches += 1

            # Track unread emails that matched
            is_unread = not email.get("isRead", True) or email.get("labelIds", []) and "UNREAD" in email.get("labelIds", [])
            if is_unread:
                unread_matches.append({
                    "deal": f"{deal.get('name')} — {deal.get('property')}",
                    "email": event_text,
                    "date": event_date,
                })

            # ── Stage signal detection ──────────────────────────────────────
            signal = detect_stage_signal(email)
            if signal:
                detected_stage, matched_phrase = signal
                current_stage = deal.get("stageOverride") or deal.get("stage", "")
                current_idx   = stage_index(current_stage)
                detected_idx  = stage_index(detected_stage)

                # Only advance forward — never regress
                if detected_idx > current_idx:
                    deal_name_label = deal.get("name", "Unknown")
                    source_subject  = email.get("subject", matched_phrase)[:80]
                    print(f'[INFO] Stage signal detected: {deal_name_label} → {detected_stage} (source: "{source_subject}")')

                    if not dry_run:
                        deal["stageOverride"]       = detected_stage
                        deal["stageOverrideDate"]   = event_date
                        deal["stageOverrideSource"] = f"email-signal: {matched_phrase}"
                        deal["stage"]               = detected_stage
                    else:
                        print(f"  [DRY-RUN] Would set stageOverride={detected_stage} on {deal_name_label}")

        # Sort timeline by date descending after all insertions
        if not dry_run:
            timeline.sort(key=lambda e: e.get("date", ""), reverse=True)

    print(f"[INFO] Matched {total_matches} email-to-deal links.")
    if unread_matches:
        print(f"[INFO] {len(unread_matches)} unread emails matched to deals:")
        for um in unread_matches[:10]:
            print(f"  ⚠️  [{um['date']}] {um['deal']}: {um['email'][:60]}")

    if not dry_run:
        updated["lastUpdated"] = datetime.now().isoformat()
        updated["staleContacts"] = compute_stale_contacts(updated)
        print(f"[INFO] Recomputed {len(updated['staleContacts'])} stale contact entries.")

    return updated


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
            ["git", "commit", "-m", f"chore: match emails to deals — {date.today().isoformat()}"],
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
    parser = argparse.ArgumentParser(description="Match Gmail emails to Command Center deals.")
    parser.add_argument("--days",    type=int, default=7,   help="Lookback period in days (default: 7)")
    parser.add_argument("--push",    action="store_true",   help="Git commit + push after writing")
    parser.add_argument("--dry-run", action="store_true",   help="Print matches, don't write files")
    args = parser.parse_args()

    print(f"[INFO] Starting email match — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[INFO] Lookback: {args.days} days")

    existing = load_json(DATA_FILE)
    emails   = fetch_emails(args.days)

    if not emails:
        print("[WARN] No emails fetched. Updating staleContacts only.")
        if not args.dry_run:
            existing["staleContacts"] = compute_stale_contacts(existing)
            existing["lastUpdated"] = datetime.now().isoformat()
            DATA_FILE.write_text(json.dumps(existing, indent=2, ensure_ascii=False))
            print(f"[INFO] Written: {DATA_FILE}")
        return

    if args.dry_run:
        print("\n[DRY-RUN] Matches found (no files written):")

    updated = match_and_update(existing, emails, dry_run=args.dry_run)

    if args.dry_run:
        print("\n[DRY-RUN] No files written.")
        return

    DATA_FILE.write_text(json.dumps(updated, indent=2, ensure_ascii=False))
    print(f"[INFO] Written: {DATA_FILE}")

    if args.push:
        git_push(PROJECT_ROOT)

    print("[INFO] Email match complete.")


if __name__ == "__main__":
    main()
