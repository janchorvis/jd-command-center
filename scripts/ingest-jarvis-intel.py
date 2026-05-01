#!/usr/bin/env python3
from __future__ import annotations
"""
ingest-jarvis-intel.py
Ingests structured deal intelligence from Jarvis sessions (meeting recaps,
morning briefings, brain dumps, ad-hoc updates) into hot-deals.json.

Accepts a JSON file with deal updates, new deals, timeline entries, action items,
and dropped/completed signals. Merges into hot-deals.json without clobbering
existing data.

Usage:
  python3 ingest-jarvis-intel.py --input /tmp/intel.json           # Merge intel
  python3 ingest-jarvis-intel.py --input /tmp/intel.json --push    # Merge + git push
  python3 ingest-jarvis-intel.py --input /tmp/intel.json --dry-run # Print changes only

Input JSON schema:
{
  "source": "meeting-recap|morning-briefing|ad-hoc",
  "sourceDate": "2026-03-24",
  "sourceLabel": "Leasing Meeting Recap - 3/24/2026",
  "dealUpdates": [
    {
      "matchKey": "five-below|malone-five-below|Five Below",
      "property": "Malone Plaza",
      "status": "LOI signed and returned 3/17. REC meeting 4/22.",
      "stage": "LOI",
      "nextStep": "Wait for REC approval 4/22.",
      "priority": "high",
      "timeline": [
        { "date": "2026-03-24", "event": "Meeting: LOI signed, REC 4/22", "type": "meeting" }
      ],
      "contacts": ["Bill Castagna (Five Below RE Manager)"]
    }
  ],
  "newDeals": [
    {
      "id": "emerson-live-nation",
      "name": "Live Nation",
      "property": "Emerson Hall",
      "status": "National entertainment tenant, 6-7K SF showroom.",
      "stage": "Contact Made",
      "nextStep": "Owner meeting Monday 3/24.",
      "priority": "high",
      "pipelineType": "pipeline|side",
      "contacts": ["Josh Levy (Arbor Realty Capital Advisors)"],
      "timeline": [
        { "date": "2026-03-23", "event": "Inquiry forwarded to Micah", "type": "lead" }
      ]
    }
  ],
  "actionItems": [
    { "text": "Draft Prather event lease", "deal": "prather-event", "priority": "high" }
  ],
  "droppedDeals": [
    { "matchKey": "cosmoprof", "note": "5 weeks no response" }
  ],
  "completedDeals": [
    { "matchKey": "qt-nails", "note": "Lease executed" }
  ]
}
"""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ─── Config ───────────────────────────────────────────────────────────────────

WORKSPACE_ROOT = Path("/Users/fostercreighton/.openclaw/workspace")
PROJECT_ROOT   = WORKSPACE_ROOT / "jd-command-center"
DATA_FILE      = PROJECT_ROOT / "data" / "hot-deals.json"

STAGE_ORDER = [
    "Contact Made",
    "Touring",
    "Obtain Financials",
    "Trading Terms",
    "LOI",
    "Lease Draft & Review",
    "Lease Signed",
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def load_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def save_json(path: Path, data: dict):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"[OK] Wrote {path} ({path.stat().st_size:,} bytes)")


def slugify(text: str) -> str:
    """Convert text to a slug for deal IDs."""
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def normalize(text: str) -> str:
    """Lowercase, strip punctuation for matching."""
    return re.sub(r'[^a-z0-9\s]', '', text.lower()).strip()


def match_deal(deals: list, match_key: str) -> tuple[int, dict] | tuple[None, None]:
    """
    Find a deal in the list by flexible matching on id, name, property, or slug.
    Returns (index, deal) or (None, None).
    """
    key_lower = normalize(match_key)
    key_slug = slugify(match_key)

    # Exact id match first
    for i, d in enumerate(deals):
        if d.get("id") == match_key or d.get("id") == key_slug:
            return i, d

    # Name or property contains match
    for i, d in enumerate(deals):
        deal_name = normalize(d.get("name", ""))
        deal_prop = normalize(d.get("property", ""))
        deal_id = normalize(d.get("id", ""))
        if key_lower in deal_name or key_lower in deal_prop or key_lower in deal_id:
            return i, d
        # Reverse: deal name in match key
        if deal_name and deal_name in key_lower:
            return i, d

    return None, None


def stage_index(stage: str) -> int:
    """Get the ordinal position of a stage. -1 if unknown."""
    try:
        return STAGE_ORDER.index(stage)
    except ValueError:
        return -1


def merge_timeline(existing: list, new_entries: list) -> list:
    """Merge new timeline entries, avoiding duplicates by date+event."""
    existing_keys = {(e.get("date"), e.get("event")) for e in existing}
    for entry in new_entries:
        key = (entry.get("date"), entry.get("event"))
        if key not in existing_keys:
            existing.append(entry)
            existing_keys.add(key)
    # Sort by date descending (newest first)
    existing.sort(key=lambda e: e.get("date", ""), reverse=True)
    return existing


def merge_contacts(existing: list, new_contacts: list) -> list:
    """Merge contacts, avoiding duplicates by normalized name."""
    existing_names = {normalize(c) for c in existing}
    for contact in new_contacts:
        if normalize(contact) not in existing_names:
            existing.append(contact)
            existing_names.add(normalize(contact))
    return existing


# ─── Main logic ───────────────────────────────────────────────────────────────

def ingest(intel: dict, data: dict, dry_run: bool = False) -> dict:
    """
    Merge intel into hot-deals.json data. Returns updated data dict.
    """
    source = intel.get("source", "unknown")
    source_label = intel.get("sourceLabel", source)
    source_date = intel.get("sourceDate", datetime.now().strftime("%Y-%m-%d"))
    changes = []

    pipeline_deals = data.get("pipelineDeals", [])
    side_deals = data.get("sideDeals", [])
    dropped_balls = data.get("droppedBalls", [])

    # ─── Deal Updates ─────────────────────────────────────────────────────
    for update in intel.get("dealUpdates", []):
        match_key = update.get("matchKey", "")

        # Search both pipeline and side deals
        idx, deal = match_deal(pipeline_deals, match_key)
        deal_list = pipeline_deals
        deal_type = "pipeline"

        if deal is None:
            idx, deal = match_deal(side_deals, match_key)
            deal_list = side_deals
            deal_type = "side"

        if deal is None:
            print(f"[WARN] No match for '{match_key}' — skipping update")
            continue

        deal_name = deal.get("name", match_key)

        # Update status
        if update.get("status"):
            old_status = deal.get("status", "")
            deal["status"] = update["status"]
            if old_status != update["status"]:
                changes.append(f"  {deal_name}: status updated")

        # Update stage (forward-only)
        if update.get("stage"):
            old_stage = deal.get("stage", "")
            new_idx = stage_index(update["stage"])
            old_idx = stage_index(old_stage)
            if new_idx > old_idx:
                deal["stage"] = update["stage"]
                deal["stageOverride"] = update["stage"]
                changes.append(f"  {deal_name}: stage {old_stage} → {update['stage']}")
            elif new_idx == old_idx:
                pass  # Same stage, no change needed
            else:
                print(f"[SKIP] {deal_name}: stage regression blocked ({old_stage} → {update['stage']})")

        # Update next step
        if update.get("nextStep"):
            deal["nextStep"] = update["nextStep"]

        # Update priority
        if update.get("priority"):
            deal["priority"] = update["priority"]

        # Merge timeline entries
        if update.get("timeline"):
            deal["timeline"] = merge_timeline(deal.get("timeline", []), update["timeline"])
            changes.append(f"  {deal_name}: +{len(update['timeline'])} timeline entries")

        # Merge contacts
        if update.get("contacts"):
            deal["contacts"] = merge_contacts(deal.get("contacts", []), update["contacts"])

        # Update property if provided
        if update.get("property"):
            deal["property"] = update["property"]

    # ─── New Deals ────────────────────────────────────────────────────────
    for new_deal in intel.get("newDeals", []):
        deal_id = new_deal.get("id") or slugify(f"{new_deal.get('property', '')}-{new_deal.get('name', '')}")
        pipeline_type = new_deal.get("pipelineType", "pipeline")

        # Check if deal already exists
        target_list = pipeline_deals if pipeline_type == "pipeline" else side_deals
        existing_idx, existing = match_deal(target_list, deal_id)
        if existing_idx is not None:
            # If it exists, just skip - use dealUpdates to update existing deals
            existing_name = existing.get("name", deal_id)
            print(f"[SKIP] '{existing_name}' already exists — use dealUpdates to modify")
            continue

        deal_obj = {
            "id": deal_id,
            "name": new_deal.get("name", ""),
            "property": new_deal.get("property", ""),
            "status": new_deal.get("status", ""),
            "stage": new_deal.get("stage", "Contact Made"),
            "nextStep": new_deal.get("nextStep", ""),
            "priority": new_deal.get("priority", "medium"),
            "contacts": new_deal.get("contacts", []),
            "timeline": new_deal.get("timeline", []),
            "actions": new_deal.get("actions", []),
        }

        if pipeline_type == "side":
            deal_obj["type"] = new_deal.get("type", "Tenant Rep")
            deal_obj["lastUpdate"] = source_date
            side_deals.append(deal_obj)
        else:
            pipeline_deals.append(deal_obj)

        changes.append(f"  NEW ({pipeline_type}): {deal_obj['name']} @ {deal_obj['property']} [{deal_obj['stage']}]")

    # ─── Dropped Deals ────────────────────────────────────────────────────
    for dropped in intel.get("droppedDeals", []):
        match_key = dropped.get("matchKey", "")
        idx, deal = match_deal(pipeline_deals, match_key)
        deal_list_name = "pipeline"
        if deal is None:
            idx, deal = match_deal(side_deals, match_key)
            deal_list_name = "side"

        if deal:
            # Add to droppedBalls if not already there
            already_dropped = any(
                normalize(db.get("name", "")) == normalize(deal.get("name", ""))
                for db in dropped_balls
            )
            if not already_dropped:
                dropped_balls.append({
                    "id": deal.get("id", slugify(match_key)),
                    "name": deal.get("name", match_key),
                    "property": deal.get("property", ""),
                    "lastSeen": source_label,
                    "note": dropped.get("note", ""),
                })
                changes.append(f"  DROPPED: {deal.get('name', match_key)}")
        else:
            print(f"[WARN] No match for dropped deal '{match_key}'")

    # ─── Completed Deals ──────────────────────────────────────────────────
    for completed in intel.get("completedDeals", []):
        match_key = completed.get("matchKey", "")
        idx, deal = match_deal(pipeline_deals, match_key)
        if deal:
            deal["stage"] = "Lease Signed"
            deal["stageOverride"] = "Lease Signed"
            deal["status"] = completed.get("note", "Completed")
            if completed.get("timeline"):
                deal["timeline"] = merge_timeline(deal.get("timeline", []), completed["timeline"])
            changes.append(f"  COMPLETED: {deal.get('name', match_key)}")

    # ─── Action Items → today.priorities ──────────────────────────────────
    action_items = intel.get("actionItems", [])
    if action_items:
        today_block = data.get("today", {})
        existing_priorities = today_block.get("priorities", [])
        added = 0
        for item in action_items:
            text = item.get("text", item) if isinstance(item, dict) else str(item)
            if text and text not in existing_priorities:
                existing_priorities.append(text)
                added += 1
        today_block["priorities"] = existing_priorities
        data["today"] = today_block
        if added:
            changes.append(f"  +{added} action items to today.priorities")

    # ─── Write back ───────────────────────────────────────────────────────
    data["pipelineDeals"] = pipeline_deals
    data["sideDeals"] = side_deals
    data["droppedBalls"] = dropped_balls
    data["lastUpdated"] = datetime.now().isoformat()

    # Print summary
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Ingest from: {source_label}")
    if changes:
        print(f"Changes ({len(changes)}):")
        for c in changes:
            print(c)
    else:
        print("No changes detected.")

    return data


def git_push(project_root: Path, message: str):
    """Git add, commit, push."""
    try:
        subprocess.run(["git", "add", "data/hot-deals.json"], cwd=project_root, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", message], cwd=project_root, check=True, capture_output=True)
        result = subprocess.run(["git", "push"], cwd=project_root, check=True, capture_output=True, text=True)
        print(f"[OK] git push succeeded")
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr)
        if "nothing to commit" in stderr:
            print("[OK] No changes to commit")
        else:
            print(f"[WARN] git error: {stderr}", file=sys.stderr)


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Ingest Jarvis deal intelligence into hot-deals.json")
    parser.add_argument("--input", required=True, help="Path to intel JSON file")
    parser.add_argument("--push", action="store_true", help="Git commit + push after write")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing")
    args = parser.parse_args()

    intel_path = Path(args.input)
    if not intel_path.exists():
        print(f"[ERROR] Input file not found: {intel_path}", file=sys.stderr)
        sys.exit(1)

    intel = load_json(intel_path)
    data = load_json(DATA_FILE)

    updated = ingest(intel, data, dry_run=args.dry_run)

    if not args.dry_run:
        save_json(DATA_FILE, updated)
        if args.push:
            source_label = intel.get("sourceLabel", "jarvis intel")
            git_push(PROJECT_ROOT, f"chore: ingest {source_label}")


if __name__ == "__main__":
    main()
