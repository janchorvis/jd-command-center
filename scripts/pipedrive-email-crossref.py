#!/usr/bin/env python3
from __future__ import annotations
"""
pipedrive-email-crossref.py
Cross-references Pipedrive deal activity with email activity in hot-deals.json
to flag disconnects:
  - "Email-active, Pipedrive-stale": recent emails but Pipedrive hasn't moved
  - "Pipedrive-active, no email trail": Pipedrive updated but no supporting emails

Usage:
  python3 pipedrive-email-crossref.py               # Default: check all open deals
  python3 pipedrive-email-crossref.py --dry-run     # Show findings, don't write
  python3 pipedrive-email-crossref.py --push        # Write + git commit + push
  python3 pipedrive-email-crossref.py --verbose     # Detailed matching logs
  python3 pipedrive-email-crossref.py --stale-days 21  # Custom stale threshold (default 14)
"""

import argparse
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

# Days threshold for "recent" email/Pipedrive activity
EMAIL_RECENT_DAYS  = 7    # email within this many days = "active"
PIPEDRIVE_STALE_DAYS_DEFAULT = 14  # Pipedrive not updated in this many days = "stale"

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


# ─── Pipedrive API ────────────────────────────────────────────────────────────

def fetch_pipedrive_deals(env: dict, verbose: bool = False) -> list[dict]:
    """Fetch all open deals from Pipedrive pipeline 4 (Leasing)."""
    token  = env.get("PIPEDRIVE_API_TOKEN", "")
    domain = env.get("PIPEDRIVE_DOMAIN", "")

    if not token or not domain:
        print("[ERROR] PIPEDRIVE_API_TOKEN or PIPEDRIVE_DOMAIN not set.", file=sys.stderr)
        return []

    print("[INFO] Fetching Pipedrive deals (pipeline 4)...")
    deals = []
    start = 0
    limit = 500

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

        deals.extend(data)

        more = body.get("additional_data", {}).get("pagination", {}).get("more_items_in_collection", False)
        if not more:
            break
        start += limit

    print(f"[INFO] Fetched {len(deals)} open Pipedrive deals.")
    if verbose:
        for d in deals[:10]:
            print(f"  [PD] {d.get('title', '?')} | updated: {d.get('update_time', '?')} | stage: {STAGE_MAP.get(d.get('stage_id'), d.get('stage_id', '?'))}")
        if len(deals) > 10:
            print(f"  ... and {len(deals) - 10} more")

    return deals


def parse_pipedrive_date(dt_str: str | None) -> date | None:
    """Parse a Pipedrive datetime string to a date. Returns None on failure."""
    if not dt_str:
        return None
    try:
        # Format: "2026-03-10 14:23:01"
        return datetime.strptime(dt_str[:10], "%Y-%m-%d").date()
    except Exception:
        pass
    try:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00")).date()
    except Exception:
        return None


def get_pipedrive_last_activity(deal: dict) -> date | None:
    """
    Return the most recent activity date for a Pipedrive deal.
    Checks: last_activity_date, update_time, add_time (in priority order).
    """
    for field in ("last_activity_date", "update_time", "add_time"):
        val = deal.get(field)
        if val:
            dt = parse_pipedrive_date(str(val))
            if dt:
                return dt
    return None


# ─── Deal matching ────────────────────────────────────────────────────────────

def tokenize(text: str) -> set[str]:
    """Split text into lowercase tokens of 3+ chars."""
    return {w.lower() for w in re.split(r'\W+', text) if len(w) >= 3}


def token_overlap_score(a: str, b: str) -> float:
    """Return overlap ratio between two text strings (0.0–1.0)."""
    ta = tokenize(a)
    tb = tokenize(b)
    if not ta or not tb:
        return 0.0
    intersection = ta & tb
    union = ta | tb
    return len(intersection) / len(union)


def match_pipedrive_deal_to_hot_deal(pd_deal: dict, hot_deals: list[dict], verbose: bool = False) -> dict | None:
    """
    Try to match a Pipedrive deal to a hot-deals.json entry.
    Matching strategy (in order of priority):
      1. Pipedrive title contains hot-deal name (exact substring)
      2. Pipedrive title contains hot-deal property (exact substring)
      3. Hot-deal name or property contained in Pipedrive title
      4. Token overlap score >= 0.3 against name+property combined
    Returns the best matching hot deal, or None.
    """
    pd_title = pd_deal.get("title", "").lower()

    best_match = None
    best_score = 0.0

    for hot_deal in hot_deals:
        hd_name = hot_deal.get("name", "").lower()
        hd_prop = hot_deal.get("property", "").lower()
        combined = f"{hd_name} {hd_prop}"

        # Strategy 1 & 2: substring containment
        if hd_name and hd_name in pd_title:
            score = 0.9
        elif hd_prop and hd_prop in pd_title:
            score = 0.85
        # Strategy 3: reversed containment
        elif hd_name and pd_title in hd_name:
            score = 0.8
        elif hd_prop and pd_title in hd_prop:
            score = 0.75
        else:
            # Strategy 4: token overlap
            score = token_overlap_score(pd_title, combined)

        if score > best_score:
            best_score = score
            best_match = hot_deal

    MIN_SCORE = 0.30
    if best_score >= MIN_SCORE:
        if verbose:
            hd_name = best_match.get("name", "?")
            hd_prop = best_match.get("property", "?")
            print(f"  [MATCH] PD '{pd_deal.get('title')}' → '{hd_name} / {hd_prop}' (score={best_score:.2f})")
        return best_match

    if verbose:
        print(f"  [NO MATCH] PD '{pd_deal.get('title')}' (best score={best_score:.2f})")
    return None


# ─── Email timeline analysis ──────────────────────────────────────────────────

def get_last_email_date(hot_deal: dict) -> date | None:
    """
    Find the most recent email-type timeline event in a hot-deal.
    Returns the date, or None if no email events exist.
    """
    timeline = hot_deal.get("timeline", [])
    email_events = [e for e in timeline if e.get("type") == "email"]

    if not email_events:
        return None

    dates = []
    for ev in email_events:
        dt_str = ev.get("date", "")
        try:
            dates.append(date.fromisoformat(dt_str))
        except Exception:
            pass

    return max(dates) if dates else None


# ─── Cross-reference logic ────────────────────────────────────────────────────

def format_date_display(dt: date | None) -> str:
    """Format a date for human-readable display (e.g. 3/10)."""
    if dt is None:
        return "unknown"
    return f"{dt.month}/{dt.day}"


def compute_cross_ref_alerts(
    hot_deals: list[dict],
    pd_deals: list[dict],
    stale_days: int,
    verbose: bool = False,
) -> list[dict]:
    """
    Compare email timelines vs Pipedrive activity for each matched deal.
    Returns a list of alert dicts.
    """
    today = date.today()
    alerts = []

    # Build lookup: hot_deal id → pd_deal (best match only)
    matched_pairs = []
    unmatched_pd = []

    for pd_deal in pd_deals:
        hot_deal = match_pipedrive_deal_to_hot_deal(pd_deal, hot_deals, verbose=verbose)
        if hot_deal:
            matched_pairs.append((pd_deal, hot_deal))
        else:
            unmatched_pd.append(pd_deal)

    print(f"[INFO] Matched {len(matched_pairs)}/{len(pd_deals)} Pipedrive deals to hot-deals.json entries.")
    if unmatched_pd and verbose:
        print(f"[INFO] Unmatched Pipedrive deals ({len(unmatched_pd)}):")
        for d in unmatched_pd:
            print(f"  - {d.get('title', '?')}")

    for pd_deal, hot_deal in matched_pairs:
        deal_name  = hot_deal.get("name", pd_deal.get("title", "?"))
        prop_name  = hot_deal.get("property", "")
        label      = f"{deal_name} / {prop_name}" if prop_name else deal_name

        pd_last = get_pipedrive_last_activity(pd_deal)
        email_last = get_last_email_date(hot_deal)

        pd_days_ago    = (today - pd_last).days    if pd_last    else None
        email_days_ago = (today - email_last).days if email_last else None

        if verbose:
            print(f"  [CHECK] {label}")
            print(f"          PD last activity:  {pd_last} ({pd_days_ago}d ago)" if pd_days_ago is not None else "          PD last activity:  unknown")
            print(f"          Email last:        {email_last} ({email_days_ago}d ago)" if email_days_ago is not None else "          Email last:        none")

        # ── Alert type 1: Email-active, Pipedrive-stale ────────────────────
        # Email in last EMAIL_RECENT_DAYS but Pipedrive not updated in stale_days+
        if (
            email_days_ago is not None
            and email_days_ago <= EMAIL_RECENT_DAYS
            and (pd_days_ago is None or pd_days_ago >= stale_days)
        ):
            pd_display    = format_date_display(pd_last) if pd_last else "never"
            email_display = format_date_display(email_last)
            severity = "high" if (pd_days_ago is None or pd_days_ago >= stale_days * 2) else "medium"

            msg = f"Last email {email_display}, Pipedrive not updated since {pd_display}"
            alerts.append({
                "deal":     deal_name,
                "property": prop_name,
                "type":     "email-active-pipedrive-stale",
                "message":  msg,
                "severity": severity,
                "details": {
                    "lastEmailDate":     email_last.isoformat() if email_last else None,
                    "lastPipedriveDate": pd_last.isoformat() if pd_last else None,
                    "emailDaysAgo":      email_days_ago,
                    "pipedriveDaysAgo":  pd_days_ago,
                },
            })
            print(f"  [ALERT] email-active-pipedrive-stale [{severity}]: {label} — {msg}")

        # ── Alert type 2: Pipedrive-active, no email trail ─────────────────
        # Pipedrive updated in last EMAIL_RECENT_DAYS but no email in stale_days+
        elif (
            pd_days_ago is not None
            and pd_days_ago <= EMAIL_RECENT_DAYS
            and (email_days_ago is None or email_days_ago >= stale_days)
        ):
            pd_display    = format_date_display(pd_last)
            email_display = format_date_display(email_last) if email_last else "never"
            severity = "medium"

            if email_days_ago is None:
                msg = f"Pipedrive updated {pd_display}, no email history found"
            else:
                msg = f"Pipedrive updated {pd_display}, last email was {email_display} ({email_days_ago}d ago)"

            alerts.append({
                "deal":     deal_name,
                "property": prop_name,
                "type":     "pipedrive-active-no-email",
                "message":  msg,
                "severity": severity,
                "details": {
                    "lastEmailDate":     email_last.isoformat() if email_last else None,
                    "lastPipedriveDate": pd_last.isoformat() if pd_last else None,
                    "emailDaysAgo":      email_days_ago,
                    "pipedriveDaysAgo":  pd_days_ago,
                },
            })
            print(f"  [ALERT] pipedrive-active-no-email [{severity}]: {label} — {msg}")

        else:
            if verbose:
                print(f"          → No disconnect detected.")

    # Sort: high severity first, then by type
    severity_order = {"high": 0, "medium": 1, "low": 2}
    alerts.sort(key=lambda a: (severity_order.get(a["severity"], 3), a["type"], a["deal"]))

    return alerts


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
            ["git", "commit", "-m", f"chore: pipedrive-email crossref — {date.today().isoformat()}"],
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
        description="Cross-reference Pipedrive deal activity with email timelines."
    )
    parser.add_argument("--dry-run",    action="store_true", help="Show findings, don't write to hot-deals.json")
    parser.add_argument("--push",       action="store_true", help="Git commit + push after writing")
    parser.add_argument("--verbose",    action="store_true", help="Detailed matching and comparison logs")
    parser.add_argument("--stale-days", type=int, default=PIPEDRIVE_STALE_DAYS_DEFAULT,
                        help=f"Days without activity = 'stale' (default: {PIPEDRIVE_STALE_DAYS_DEFAULT})")
    args = parser.parse_args()

    print(f"[INFO] Starting Pipedrive/email cross-reference — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[INFO] Stale threshold: {args.stale_days} days | Email-recent threshold: {EMAIL_RECENT_DAYS} days")
    if args.dry_run:
        print("[INFO] DRY-RUN mode — no files will be written.")

    # Load env + data
    env  = load_env(ENV_FILE)
    data = load_json(DATA_FILE)

    # Get all hot deals
    hot_deals = data.get("pipelineDeals", []) + data.get("sideDeals", [])
    print(f"[INFO] Loaded {len(hot_deals)} hot deals from hot-deals.json.")

    # Fetch Pipedrive deals
    pd_deals = fetch_pipedrive_deals(env, verbose=args.verbose)
    if not pd_deals:
        print("[WARN] No Pipedrive deals fetched. Aborting cross-reference.")
        sys.exit(1)

    # Run cross-reference
    print(f"\n[INFO] Running cross-reference analysis...")
    alerts = compute_cross_ref_alerts(
        hot_deals=hot_deals,
        pd_deals=pd_deals,
        stale_days=args.stale_days,
        verbose=args.verbose,
    )

    # Summary
    print(f"\n[INFO] Found {len(alerts)} cross-reference alerts:")
    high_count   = sum(1 for a in alerts if a["severity"] == "high")
    medium_count = sum(1 for a in alerts if a["severity"] == "medium")
    print(f"       High: {high_count} | Medium: {medium_count}")

    if args.dry_run:
        print("\n[DRY-RUN] Alerts (not written):")
        for a in alerts:
            print(f"  [{a['severity'].upper():6}] [{a['type']}]")
            print(f"           {a['deal']} / {a['property']}")
            print(f"           {a['message']}")
        print("\n[DRY-RUN] No files written.")
        return

    # Write crossRefAlerts back to hot-deals.json
    data["crossRefAlerts"] = alerts
    data["lastUpdated"] = datetime.now().isoformat()

    DATA_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"[INFO] Written crossRefAlerts ({len(alerts)} items) to {DATA_FILE}")

    if args.push:
        git_push(PROJECT_ROOT)

    print("[INFO] Cross-reference complete.")


if __name__ == "__main__":
    main()
