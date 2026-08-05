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
from typing import Any

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

INTERNAL_CONTACT_NAMES = {
    "adam heston",
    "ashby scott",
    "carson knight",
    "clay richardson",
    "jacob delk",
    "mathison ingham",
    "melissa eddy",
    "micah lacher",
}

GENERIC_TOKENS = {
    "anchored",
    "anchor",
    "avenue",
    "building",
    "center",
    "centre",
    "charter",
    "commercial",
    "company",
    "drive",
    "executed",
    "former",
    "group",
    "government",
    "highway",
    "lease",
    "llc",
    "market",
    "marketplace",
    "partners",
    "phase",
    "plaza",
    "property",
    "real",
    "requirement",
    "retail",
    "road",
    "school",
    "shopping",
    "signed",
    "south",
    "street",
    "suite",
    "tenant",
    "village",
}


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


def normalize_text(text: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', str(text).lower())).strip()


def tokenize(text: str) -> list[str]:
    return [token for token in normalize_text(text).split() if token]


def contains_phrase(haystack: str, phrase: str) -> bool:
    if not haystack or not phrase:
        return False
    return f" {phrase} " in f" {haystack} "


def clean_contact_name(contact: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', str(contact))
    text = re.sub(r'\s*\(.*?\)', ' ', text)
    text = re.sub(r'\s+-\s+.*$', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip(' ,;-')
    return text


def is_internal_contact(contact: str) -> bool:
    normalized = normalize_text(clean_contact_name(contact))
    raw = str(contact).lower()
    return bool(normalized) and (normalized in INTERNAL_CONTACT_NAMES or "(anchor" in raw or "@anchorinv.com" in raw)


def distinctive_tokens(text: str, min_len: int = 5) -> list[str]:
    return [
        token for token in tokenize(text)
        if len(token) >= min_len and token not in GENERIC_TOKENS
    ]


def phrase_variants(text: str) -> set[str]:
    tokens = tokenize(text)
    phrases: set[str] = set()
    if len(tokens) >= 2:
        phrases.add(" ".join(tokens))

    significant = [token for token in tokens if token not in GENERIC_TOKENS]
    for idx in range(len(significant) - 1):
        phrases.add(f"{significant[idx]} {significant[idx + 1]}")

    return {phrase for phrase in phrases if phrase}

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


def build_email_haystack(email: dict) -> str:
    """Build a normalized searchable text blob from common email fields."""
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

    return normalize_text(" ".join(str(f) for f in fields if f))


def evaluate_email_match(email: dict, deal: dict) -> dict[str, Any]:
    """Score how confidently an email matches a deal."""
    haystack = build_email_haystack(email)

    matched_fields: list[str] = []
    strong_reasons: list[str] = []
    weak_reasons: list[str] = []

    deal_name = str(deal.get("name") or "")
    property_name = str(deal.get("property") or "")

    tenant_tokens = distinctive_tokens(deal_name)
    for phrase in phrase_variants(deal_name):
        if contains_phrase(haystack, phrase):
            strong_reasons.append(f"tenant phrase:{phrase}")
            matched_fields.append("tenant")
            break
    else:
        if len(tenant_tokens) == 1 and contains_phrase(haystack, tenant_tokens[0]):
            strong_reasons.append(f"tenant token:{tenant_tokens[0]}")
            matched_fields.append("tenant")
        elif len([token for token in tenant_tokens if contains_phrase(haystack, token)]) >= 2:
            weak_reasons.append("tenant tokens")
            matched_fields.append("tenant")

    property_matches = [phrase for phrase in phrase_variants(property_name) if contains_phrase(haystack, phrase)]
    if property_matches:
        strong_reasons.append(f"property phrase:{property_matches[0]}")
        matched_fields.append("property")

    for contact in deal.get("contacts", []):
        if is_internal_contact(contact):
            continue

        cleaned_contact = clean_contact_name(contact)
        normalized_contact = normalize_text(cleaned_contact)
        if not normalized_contact:
            continue

        contact_tokens = tokenize(cleaned_contact)
        if len(contact_tokens) >= 2 and contains_phrase(haystack, normalized_contact):
            strong_reasons.append(f"contact phrase:{normalized_contact}")
            matched_fields.append("contact")
            break

        if len(contact_tokens) >= 2 and all(contains_phrase(haystack, token) for token in {contact_tokens[0], contact_tokens[-1]}):
            weak_reasons.append(f"contact name:{contact_tokens[0]} {contact_tokens[-1]}")
            matched_fields.append("contact")
            break

    matched_fields = list(dict.fromkeys(matched_fields))
    score = len(strong_reasons) * 3 + len(weak_reasons)
    # Property-only evidence is allowed only for aggregate/property records with
    # no tenant name. A property can contain many active tenant deals.
    has_named_deal = bool(normalize_text(deal_name))
    tenant_grounded = any(reason.startswith("tenant ") for reason in strong_reasons)
    matched = (
        tenant_grounded
        or ("contact" in matched_fields and "property" in matched_fields)
        or (not has_named_deal and "property" in matched_fields)
    )

    return {
        "matched": matched,
        "score": score,
        "matchedFields": matched_fields,
        "strongReasons": strong_reasons,
        "weakReasons": weak_reasons,
        # Stage automation needs explicit tenant/deal identity. A shared broker or
        # property can legitimately span several deals and must not propagate a
        # DocuSign signal across all of them.
        "stageSafe": tenant_grounded,
    }


def select_email_match(email: dict, deals: list[dict]) -> tuple[int, dict[str, Any]] | None:
    """Choose at most one deal for an email; reject ambiguous ties."""
    candidates: list[tuple[int, dict[str, Any]]] = []
    for index, deal in enumerate(deals):
        details = evaluate_email_match(email, deal)
        if details["matched"]:
            candidates.append((index, details))

    if not candidates:
        return None

    best_score = max(details["score"] for _, details in candidates)
    best = [(index, details) for index, details in candidates if details["score"] == best_score]
    if len(best) == 1:
        return best[0]

    # A blank-name aggregate is the only safe property-level fallback. Otherwise
    # the email is ambiguous and must not be attached automatically.
    aggregates = [
        (index, details)
        for index, details in best
        if not normalize_text(str(deals[index].get("name") or ""))
        and "property" in details["matchedFields"]
    ]
    return aggregates[0] if len(aggregates) == 1 else None


def get_deal_keywords(deal: dict) -> dict[str, Any]:
    """Backward-compatible wrapper for callers/tests; returns match metadata inputs."""
    return {"deal": deal}


def email_matches_deal(email: dict, deal_keywords: dict[str, Any]) -> bool:
    """Return True only for sufficiently strong tenant/property/contact evidence."""
    deal = deal_keywords.get("deal", {}) if isinstance(deal_keywords, dict) else {}
    return evaluate_email_match(email, deal).get("matched", False)


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
    For each deal with reliable email history, create at most one stale-contact
    alert when the latest email exceeds the deal's threshold.
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
            # Absence from this cache is not proof that a contact is stale.
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

        if not is_stale:
            continue

        urgency = "high" if days_since > threshold * 2 else "medium"
        if priority == "high":
            urgency = "high"

        contacts = [c for c in deal.get("contacts", []) if not is_internal_contact(c)]
        contact_raw = contacts[0] if contacts else (deal.get("contacts", [""]) or [""])[0]
        contact = clean_contact_name(contact_raw) or deal.get("name") or deal.get("property") or "Unknown"
        deal_label = f"{deal.get('name', '')} — {deal.get('property', '')}"
        stale.append({
            "name": contact,
            "deal": deal_label,
            "daysSinceContact": days_since,
            "lastAction": latest.get("event", "")[:80],
            "urgency": urgency,
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
    selected_matches = {
        (deal_index, email_index): details
        for email_index, email in enumerate(emails)
        for selected in [select_email_match(email, all_deals)]
        if selected is not None
        for deal_index, details in [selected]
    }

    for deal_index, deal in enumerate(all_deals):
        keywords = get_deal_keywords(deal)
        timeline = deal.setdefault("timeline", [])

        for email_index, email in enumerate(emails):
            match_details = selected_matches.get((deal_index, email_index))
            if match_details is None:
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
            if signal and match_details.get("stageSafe"):
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
