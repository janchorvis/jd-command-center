#!/usr/bin/env python3
"""
prep-doc-diff.py
Compares this week's Leasing Meeting Prep doc to last week's and surfaces:
  - New deals (appeared this week, not last)
  - Dropped deals (in last week, gone this week) → auto-added to droppedBalls
  - Progressed deals (stage keywords advanced)
  - Stalled deals (status unchanged, stale keywords)
  - Updated deals (status changed but no clear progression)

Usage:
  python3 prep-doc-diff.py              # Compare latest 2 docs, write hot-deals.json
  python3 prep-doc-diff.py --dry-run    # Show diff, don't write
  python3 prep-doc-diff.py --push       # Write + git commit + push
  python3 prep-doc-diff.py --verbose    # Show full text comparison per deal
  python3 prep-doc-diff.py --weeks 2    # Compare N weeks back (default 1)
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, date
from difflib import SequenceMatcher
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────

WORKSPACE_ROOT = Path("/Users/fostercreighton/.openclaw/workspace")
PROJECT_ROOT   = WORKSPACE_ROOT / "jd-command-center"
DATA_FILE      = PROJECT_ROOT / "data" / "hot-deals.json"
ENV_FILE       = WORKSPACE_ROOT / ".env"
GOG_BIN        = "/opt/homebrew/bin/gog"
DRIVE_FOLDER   = "1VjGsjf8_m2Ucws3eUDAk2G3ejI72lVal"
GOG_ACCOUNT    = "jdelk@anchorinv.com"

# Stage progression order — earlier index = earlier stage
STAGE_PROGRESSION = [
    "contact",
    "touring",
    "tour",
    "financials",
    "terms",
    "trading",
    "loi",
    "letter of intent",
    "lease draft",
    "lease review",
    "legal",
    "lease signed",
    "executed",
    "open",
]

# Keywords that indicate deal is stalled
STALL_KEYWORDS = [
    "waiting", "no response", "tbd", "same", "still waiting",
    "haven't heard", "no update", "no word", "hold", "on hold",
    "pending", "ghosted", "no reply",
]

# Keywords that indicate deal is progressing
PROGRESS_KEYWORDS = {
    "contact":    0,
    "touring":    1,
    "tour":       1,
    "financials": 2,
    "terms":      3,
    "trading":    3,
    "loi":        4,
    "letter of intent": 4,
    "lease draft": 5,
    "lease review": 5,
    "legal":      5,
    "lease signed": 6,
    "executed":   6,
    "signed":     6,
    "open":       7,
}

# Words to ignore during fuzzy matching
STOPWORDS = {
    "the", "and", "for", "with", "from", "this", "that", "our", "are",
    "was", "has", "have", "been", "will", "would", "could", "should",
    "their", "they", "them", "its", "not", "but", "out", "new",
    "llc", "inc", "corp", "co", "tenant", "property", "deal",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def run_gog(args: list, capture: bool = True) -> tuple:
    """Run a gog CLI command. Returns (success, stdout)."""
    cmd = [GOG_BIN] + args
    try:
        result = subprocess.run(cmd, capture_output=capture, text=True, timeout=60)
        if result.returncode != 0:
            print(f"[WARN] gog failed: {' '.join(args)}", file=sys.stderr)
            if result.stderr:
                print(f"       stderr: {result.stderr[:300]}", file=sys.stderr)
            return False, ""
        return True, result.stdout.strip()
    except subprocess.TimeoutExpired:
        print(f"[WARN] gog timed out: {' '.join(args)}", file=sys.stderr)
        return False, ""
    except Exception as e:
        print(f"[WARN] gog error: {e}", file=sys.stderr)
        return False, ""


def parse_json_output(raw: str, label: str):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"[WARN] JSON parse failed for {label}: {e}", file=sys.stderr)
        return None


def git_push(project_root: Path, message: str) -> bool:
    """Commit and push hot-deals.json."""
    try:
        subprocess.run(["git", "add", "data/hot-deals.json"],
                       cwd=project_root, check=True, capture_output=True)
        result = subprocess.run(["git", "diff", "--cached", "--quiet"],
                                cwd=project_root, capture_output=True)
        if result.returncode == 0:
            print("[INFO] No changes to commit.")
            return True
        subprocess.run(["git", "commit", "-m", message],
                       cwd=project_root, check=True, capture_output=True)
        subprocess.run(["git", "push"],
                       cwd=project_root, check=True, capture_output=True)
        print("[INFO] Pushed to origin.")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[WARN] Git push failed: {e}", file=sys.stderr)
        return False


# ─── Drive: fetch N most recent prep docs ─────────────────────────────────────

def get_recent_prep_docs(n: int = 2) -> list:
    """
    Returns list of (title, text) tuples for the N most recent prep docs,
    sorted newest-first. Returns fewer if unavailable.
    """
    print("[INFO] Fetching Drive folder listing...")
    ok, raw = run_gog([
        "drive", "ls",
        "--parent", DRIVE_FOLDER,
        "--account", GOG_ACCOUNT,
        "--json",
    ])
    if not ok:
        return []

    files = parse_json_output(raw, "Drive ls")
    if not files:
        return []

    if isinstance(files, dict):
        files = files.get("files", [])

    docs = [f for f in files if isinstance(f, dict) and
            f.get("mimeType", "") == "application/vnd.google-apps.document"]

    if not docs:
        docs = [f for f in files if isinstance(f, dict)]

    if not docs:
        print("[WARN] No docs found in Drive folder.", file=sys.stderr)
        return []

    docs.sort(
        key=lambda d: d.get("modifiedTime", d.get("modified", "")),
        reverse=True,
    )

    results = []
    for doc in docs[:n]:
        doc_id    = doc.get("id", doc.get("fileId", ""))
        doc_title = doc.get("name", doc.get("title", "Prep Doc"))

        if not doc_id:
            print(f"[WARN] Skipping doc with no ID: {doc_title}", file=sys.stderr)
            continue

        print(f"[INFO] Reading: {doc_title} ({doc_id})")
        ok, text = run_gog(["docs", "cat", doc_id, "--account", GOG_ACCOUNT])
        if not ok:
            print(f"[WARN] Could not read doc: {doc_title}", file=sys.stderr)
            continue

        results.append((doc_title, text))

    return results


# ─── Doc parsing ──────────────────────────────────────────────────────────────

def parse_prep_doc_deals(doc_text: str) -> list:
    """
    Parse a prep doc into a list of deal blocks:
      [{ "header": str, "status": str, "nextStep": str, "fullText": str }, ...]

    Deal headers are short lines (< 80 chars) that look like deal names:
    title-cased with property/tenant names, not starting with bullets.
    Followed by "Status:" and "Next Step:" fields.
    """
    if not doc_text:
        return []

    lines = doc_text.splitlines()
    deals = []

    current_header  = None
    current_status  = []
    current_next    = []
    current_lines   = []
    collecting      = None   # 'status' | 'next' | None

    def _flush():
        """Save current deal to list."""
        nonlocal current_header, current_status, current_next, current_lines, collecting
        if current_header:
            deals.append({
                "header":   current_header,
                "status":   " ".join(current_status).strip(),
                "nextStep": " ".join(current_next).strip(),
                "fullText": "\n".join(current_lines).strip(),
            })
        current_header = None
        current_status = []
        current_next   = []
        current_lines  = []
        collecting     = None

    # Lines that mark section boundaries (not deal blocks)
    SECTION_HEADERS = re.compile(
        r'^(weekly priorities|priorities|action items?|this week|'
        r'next week|pipeline overview|leasing meeting|leasing update|'
        r'week of|overview|summary|agenda)\b',
        re.IGNORECASE,
    )

    # Non-deal agenda items that should be filtered out
    NON_DEAL_HEADERS = re.compile(
        r'^(wins|agenda items?|ai[/\s]|team vs|job listing|feb\s+commissions?|'
        r'commissions?|expense|misc|other|admin|internal|'
        r'prepared\s|recruitment|hiring|hr\b|staffing)',
        re.IGNORECASE,
    )

    for raw_line in lines:
        stripped = raw_line.strip()

        # ── Status: label ────────────────────────────────────────────────
        m = re.match(r'^status\s*:\s*(.*)', stripped, re.IGNORECASE)
        if m:
            collecting = 'status'
            val = m.group(1).strip()
            current_status = [val] if val else []
            if current_header:
                current_lines.append(stripped)
            continue

        # ── Next Step(s): label ──────────────────────────────────────────
        m = re.match(r'^next\s*steps?\s*:\s*(.*)', stripped, re.IGNORECASE)
        if m:
            collecting = 'next'
            val = m.group(1).strip()
            current_next = [val] if val else []
            if current_header:
                current_lines.append(stripped)
            continue

        # ── Empty line: break collecting (but keep current deal) ─────────
        if not stripped:
            collecting = None
            if current_header:
                current_lines.append("")
            continue

        # ── Detect new deal header ────────────────────────────────────────
        is_header = (
            len(stripped) < 80
            and not stripped.startswith(('-', '•', '*', '·'))
            and not stripped[0].isdigit()
            and not SECTION_HEADERS.match(stripped)
            and not re.match(r'^(status|next|priority|action|contact|notes?|'
                              r'background|context|update|week|date)\s*:', stripped, re.IGNORECASE)
            # Must contain at least one capitalized word (proper noun / deal name)
            and bool(re.search(r'\b[A-Z][a-zA-Z]{2,}', stripped))
            # Exclude lines that are clearly sentences (ends with period, contains verb)
            and not (stripped.endswith('.') and len(stripped.split()) > 8)
            # Must not be all-lowercase (those are continuation lines)
            and stripped != stripped.lower()
        )

        if is_header:
            # Skip non-deal agenda items
            if NON_DEAL_HEADERS.match(stripped):
                _flush()
                current_header = None
                collecting = None
                continue

            # Check if this looks like a deal header vs generic text.
            # Deal headers often contain: a dash/em-dash separator, or
            # known patterns like "Tenant – Property" or "PROPERTY NAME"
            has_deal_pattern = (
                '–' in stripped or
                ' - ' in stripped or
                stripped.isupper() or
                re.search(r'\b(plaza|center|centre|mall|crossing|village|'
                           r'square|park|commons|market|strip|shops|'
                           r'fitness|below|above|salon|cafe|coffee|'
                           r'nails|smiles|retail|dept|dollar|'
                           r'russellville|gastonia|montgomery|mcminnville|'
                           r'shelbyville|gallatin|sevierville|buena\s*vista|'
                           r'emerson|malone|hawkins|dixie)\b', stripped, re.IGNORECASE)
            )
            # Also treat any short title-cased line after a blank+previous-deal as a header
            if has_deal_pattern or (
                collecting is None
                and current_header is not None
                and len(stripped.split()) <= 6
            ):
                _flush()
                current_header = stripped
                current_lines  = [stripped]
                # Default to collecting status (body text IS the status in free-form docs)
                collecting     = 'status'
                continue

        # ── Accumulate content ────────────────────────────────────────────
        if current_header:
            current_lines.append(stripped)
            if collecting == 'status':
                # Accumulate all body text as status (free-form doc format)
                current_status.append(stripped)
            elif collecting == 'next':
                current_next.append(stripped)

    _flush()  # Save last deal
    return deals


# ─── Fuzzy matching ───────────────────────────────────────────────────────────

def _tokenize(text: str) -> set:
    """Normalize and tokenize a header string for comparison."""
    text = text.lower()
    # Normalize dashes
    text = re.sub(r'[–—]', '-', text)
    tokens = set(re.split(r'[\W\-]+', text))
    return {t for t in tokens if len(t) > 2 and t not in STOPWORDS}


def _similarity(a: str, b: str) -> float:
    """Sequence similarity ratio between two strings."""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def fuzzy_match_deals(this_deals: list, last_deals: list) -> list:
    """
    Match deals across two weeks.
    Returns list of (this_deal, last_deal) tuples for matched pairs.
    Unmatched this-week deals and unmatched last-week deals are returned separately.

    Returns: (matched_pairs, new_this_week, dropped_last_week)
    """
    matched_pairs   = []   # [(this_deal, last_deal), ...]
    used_last       = set()

    for this in this_deals:
        this_tokens = _tokenize(this["header"])
        best_match  = None
        best_score  = 0.0

        for i, last in enumerate(last_deals):
            if i in used_last:
                continue

            last_tokens = _tokenize(last["header"])

            # Exact match after normalization
            if this["header"].lower().strip() == last["header"].lower().strip():
                best_match = i
                best_score = 1.0
                break

            # High sequence similarity (same string, small edit)
            seq_sim = _similarity(this["header"], last["header"])
            if seq_sim >= 0.85:
                if seq_sim > best_score:
                    best_score = seq_sim
                    best_match = i
                continue

            # Token overlap (50%+ threshold)
            if this_tokens and last_tokens:
                overlap = this_tokens & last_tokens
                union   = this_tokens | last_tokens
                jaccard = len(overlap) / len(union) if union else 0
                # Also check one-sided: overlap / smaller set (handles subsets)
                one_sided = len(overlap) / min(len(this_tokens), len(last_tokens)) \
                            if min(len(this_tokens), len(last_tokens)) > 0 else 0
                score = max(jaccard, one_sided)
                if score >= 0.50 and score > best_score:
                    best_score = score
                    best_match = i

        if best_match is not None:
            matched_pairs.append((this, last_deals[best_match]))
            used_last.add(best_match)
        # else: this deal is "new" (unmatched this week)

    new_deals     = [d for d in this_deals if not any(d is p[0] for p in matched_pairs)]
    dropped_deals = [last_deals[i] for i in range(len(last_deals)) if i not in used_last]

    return matched_pairs, new_deals, dropped_deals


# ─── Status classification ────────────────────────────────────────────────────

def _stage_score(text: str) -> int:
    """Return the highest stage index found in text. -1 if none."""
    text_lower = text.lower()
    best = -1
    for keyword, score in PROGRESS_KEYWORDS.items():
        if keyword in text_lower:
            best = max(best, score)
    return best


def classify_change(this_deal: dict, last_deal: dict) -> tuple:
    """
    Compare this week's deal to last week's.
    Returns (category, change_info_dict) where category is one of:
      'progressed' | 'stalled' | 'updated' | 'no_change'
    """
    this_status = this_deal.get("status", "").strip()
    last_status = last_deal.get("status", "").strip()

    # No status data — call it no_change
    if not this_status and not last_status:
        return "no_change", {}

    # Near-identical (>90% similar)
    sim = _similarity(this_status, last_status)
    if sim >= 0.90:
        return "no_change", {}

    # Stage scores
    this_score = _stage_score(this_status)
    last_score = _stage_score(last_status)

    # Progressed: stage score went up
    if this_score > last_score and this_score >= 0:
        return "progressed", {
            "from": last_status,
            "to":   this_status,
        }

    # Stalled: contains stall keywords and score didn't advance
    this_lower = this_status.lower()
    if any(kw in this_lower for kw in STALL_KEYWORDS):
        return "stalled", {
            "status": this_status,
        }

    # Updated: status changed but no clear progression
    if this_status != last_status:
        return "updated", {
            "from": last_status,
            "to":   this_status,
        }

    return "no_change", {}


# ─── Deal name/property extraction ────────────────────────────────────────────

def _extract_tenant_and_property(header: str) -> tuple:
    """
    Try to split 'Tenant – Property' or 'Tenant - Property' headers.
    Returns (tenant, property). Falls back to (header, "") if no separator.
    """
    # Normalize dashes
    h = re.sub(r'[–—]', ' - ', header)
    parts = re.split(r'\s*-\s*', h, maxsplit=1)
    if len(parts) == 2:
        return parts[0].strip(), parts[1].strip()
    return header.strip(), ""


# ─── droppedBalls integration ─────────────────────────────────────────────────

def _make_dropped_ball_id(name: str, prop: str) -> str:
    """Generate a stable ID for a dropped deal."""
    combined = f"{name}-{prop}".lower()
    return re.sub(r'[^a-z0-9]+', '-', combined).strip('-')


def update_dropped_balls(existing_data: dict, dropped_deals: list,
                         last_title: str) -> dict:
    """
    Add any dropped deals to droppedBalls if not already present.
    Returns updated data dict.
    """
    dropped_balls = existing_data.get("droppedBalls", [])
    existing_ids  = {b.get("id", "") for b in dropped_balls}

    # Extract week label from doc title (e.g., "Week of 3/2/26")
    week_label = re.search(r'week of .+', last_title, re.IGNORECASE)
    week_str   = week_label.group(0).title() if week_label else last_title

    for deal in dropped_deals:
        tenant, prop = _extract_tenant_and_property(deal["header"])
        ball_id = _make_dropped_ball_id(tenant, prop)

        if ball_id not in existing_ids:
            entry = {
                "id":       ball_id,
                "name":     tenant,
                "property": prop or deal["header"],
                "lastSeen": week_str,
                "note":     (
                    f"Dropped from prep doc. Last status: {deal['status']}"
                    if deal.get("status")
                    else "Dropped from prep doc with no status recorded."
                ),
            }
            dropped_balls.append(entry)
            existing_ids.add(ball_id)
            print(f"[INFO] Added to droppedBalls: {deal['header']}")

    existing_data["droppedBalls"] = dropped_balls
    return existing_data


# ─── Build prepDocDiff ────────────────────────────────────────────────────────

def build_prep_doc_diff(
    this_title: str,
    last_title: str,
    matched_pairs: list,
    new_deals: list,
    dropped_deals: list,
    verbose: bool = False,
) -> dict:
    """Build the prepDocDiff JSON object."""

    diff = {
        "generatedAt": datetime.now().isoformat(),
        "thisWeek":    this_title,
        "lastWeek":    last_title,
        "new":         [],
        "dropped":     [],
        "progressed":  [],
        "stalled":     [],
        "updated":     [],
        "noChange":    [],
    }

    # New deals
    for deal in new_deals:
        tenant, prop = _extract_tenant_and_property(deal["header"])
        entry = {
            "name":     tenant,
            "property": prop or deal["header"],
            "status":   deal.get("status", ""),
            "nextStep": deal.get("nextStep", ""),
        }
        diff["new"].append(entry)
        print(f"  🟢 NEW:       {deal['header']}")
        if verbose:
            print(f"             Status: {deal.get('status', '(none)')}")

    # Dropped deals
    for deal in dropped_deals:
        tenant, prop = _extract_tenant_and_property(deal["header"])
        entry = {
            "name":       tenant,
            "property":   prop or deal["header"],
            "lastStatus": deal.get("status", ""),
        }
        diff["dropped"].append(entry)
        print(f"  🔴 DROPPED:   {deal['header']}")
        if verbose:
            print(f"             Last status: {deal.get('status', '(none)')}")

    # Matched deals — classify changes
    for this_deal, last_deal in matched_pairs:
        tenant, prop = _extract_tenant_and_property(this_deal["header"])
        category, change_info = classify_change(this_deal, last_deal)

        if verbose:
            print(f"\n  [{category.upper()}] {this_deal['header']}")
            print(f"    LAST:  {last_deal.get('status', '(none)')}")
            print(f"    THIS:  {this_deal.get('status', '(none)')}")

        base = {"name": tenant, "property": prop or this_deal["header"]}

        if category == "progressed":
            diff["progressed"].append({**base, **change_info})
            print(f"  📈 PROGRESS:  {this_deal['header']}")
            print(f"             {change_info.get('from','?')} → {change_info.get('to','?')}")

        elif category == "stalled":
            diff["stalled"].append({
                **base,
                "status": change_info.get("status", this_deal.get("status", "")),
                "weeksUnchanged": 1,  # base; can be incremented by caller
            })
            print(f"  ⚠️  STALLED:   {this_deal['header']}")

        elif category == "updated":
            diff["updated"].append({**base, **change_info})
            print(f"  🔄 UPDATED:   {this_deal['header']}")
            if not verbose:
                print(f"             {change_info.get('from','?')[:60]} → {change_info.get('to','?')[:60]}")

        else:  # no_change
            diff["noChange"].append({**base, "status": this_deal.get("status", "")})
            if verbose:
                print(f"  ➖ NO CHANGE: {this_deal['header']}")

    return diff


# ─── Weeks-unchanged tracking ─────────────────────────────────────────────────

def _update_stall_weeks(new_diff: dict, existing_diff: dict) -> dict:
    """
    Carry forward weeksUnchanged counts from the previous prepDocDiff.
    Deals that were stalled last week and are stalled again this week get +1.
    """
    if not existing_diff:
        return new_diff

    prev_stalled = {
        (s.get("name", ""), s.get("property", "")): s.get("weeksUnchanged", 1)
        for s in existing_diff.get("stalled", [])
    }
    prev_no_change = {
        (s.get("name", ""), s.get("property", "")): s.get("weeksUnchanged", 1)
        for s in existing_diff.get("noChange", [])
    }

    for stall in new_diff.get("stalled", []):
        key = (stall.get("name", ""), stall.get("property", ""))
        prev = prev_stalled.get(key, prev_no_change.get(key, 0))
        stall["weeksUnchanged"] = prev + 1

    for nc in new_diff.get("noChange", []):
        key = (nc.get("name", ""), nc.get("property", ""))
        prev = prev_stalled.get(key, prev_no_change.get(key, 0))
        nc["weeksUnchanged"] = prev + 1 if prev > 0 else 1

    return new_diff


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Diff leasing prep docs week-over-week."
    )
    parser.add_argument("--dry-run",  action="store_true",
                        help="Show diff, don't write files")
    parser.add_argument("--push",     action="store_true",
                        help="Git commit + push after writing")
    parser.add_argument("--verbose",  action="store_true",
                        help="Show full text comparison per deal")
    parser.add_argument("--weeks",    type=int, default=1,
                        help="Compare N weeks back (default 1)")
    args = parser.parse_args()

    n_docs = args.weeks + 1  # need N+1 docs to compare N weeks back
    print(f"[INFO] prep-doc-diff — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[INFO] Fetching {n_docs} most recent prep docs...")

    docs = get_recent_prep_docs(n=n_docs)

    if len(docs) < 2:
        print("[ERROR] Need at least 2 prep docs to compare. Found:", len(docs), file=sys.stderr)
        sys.exit(1)

    # docs[0] = this week (most recent), docs[-1] = comparison week
    this_title, this_text = docs[0]
    last_title, last_text = docs[-1]

    print(f"\n[INFO] This week: {this_title}")
    print(f"[INFO] Last week: {last_title}")

    # Parse deal blocks from both docs
    print("\n[INFO] Parsing deal blocks...")
    this_deals = parse_prep_doc_deals(this_text)
    last_deals = parse_prep_doc_deals(last_text)

    print(f"[INFO] This week: {len(this_deals)} deals found")
    print(f"[INFO] Last week: {len(last_deals)} deals found")

    if args.verbose:
        print("\n--- This week's deals ---")
        for d in this_deals:
            print(f"  · {d['header']}")
            if d.get('status'):
                print(f"      Status: {d['status'][:80]}")
        print("\n--- Last week's deals ---")
        for d in last_deals:
            print(f"  · {d['header']}")
            if d.get('status'):
                print(f"      Status: {d['status'][:80]}")

    # Fuzzy match deals across weeks
    print("\n[INFO] Matching deals across weeks...")
    matched_pairs, new_deals, dropped_deals = fuzzy_match_deals(this_deals, last_deals)

    print(f"[INFO] Matched: {len(matched_pairs)} | New: {len(new_deals)} | Dropped: {len(dropped_deals)}")

    # Build diff
    print("\n[INFO] Classifying changes...")
    diff = build_prep_doc_diff(
        this_title, last_title,
        matched_pairs, new_deals, dropped_deals,
        verbose=args.verbose,
    )

    # Load existing data and carry forward stall counts
    existing_data = load_json(DATA_FILE)
    existing_diff = existing_data.get("prepDocDiff", {})
    diff = _update_stall_weeks(diff, existing_diff)

    # Summary
    print(f"\n{'='*50}")
    print(f"  PREP DOC DIFF SUMMARY")
    print(f"  {this_title}")
    print(f"  vs {last_title}")
    print(f"{'='*50}")
    print(f"  🟢 New deals:      {len(diff['new'])}")
    print(f"  🔴 Dropped:        {len(diff['dropped'])}")
    print(f"  📈 Progressed:     {len(diff['progressed'])}")
    print(f"  ⚠️  Stalled:        {len(diff['stalled'])}")
    print(f"  🔄 Updated:        {len(diff['updated'])}")
    print(f"  ➖ No change:      {len(diff['noChange'])}")
    print(f"{'='*50}")

    if args.dry_run:
        print("\n[DRY-RUN] prepDocDiff would be written:")
        print(json.dumps(diff, indent=2))
        if dropped_deals:
            print(f"\n[DRY-RUN] {len(dropped_deals)} deals would be added to droppedBalls")
        print("\n[DRY-RUN] No files written.")
        return

    # Write to hot-deals.json
    existing_data["prepDocDiff"] = diff

    # Update droppedBalls
    if dropped_deals:
        existing_data = update_dropped_balls(existing_data, dropped_deals, last_title)

    DATA_FILE.write_text(
        json.dumps(existing_data, indent=2, ensure_ascii=False)
    )
    print(f"\n[INFO] Written: {DATA_FILE}")

    if args.push:
        git_push(
            PROJECT_ROOT,
            f"chore: prep-doc-diff — {date.today().isoformat()}",
        )

    print("[INFO] Done.")


if __name__ == "__main__":
    main()
