#!/usr/bin/env python3
"""Add a product/engineering collaboration to the promotion tracker. Run: python add_product_sync.py"""
import sys
from datetime import datetime

from data_utils import load_data, add_activity, COMPETENCY_CATEGORIES


def prompt(prompt_text, default=""):
    val = input(f"  {prompt_text} [{default}]: ").strip() if default else input(f"  {prompt_text}: ").strip()
    return val if val else default


SYNC_TYPES = ["cross_functional_sync", "beta_testing", "sdk_access", "field_feedback", "customer_driven_technical", "other"]


def main():
    print("\n--- Add Product/Engineering Collaboration ---\n")
    data = load_data()

    participants = prompt("Participants (names/roles, comma-separated)", "")
    topic = prompt("Topic / initiative", "")
    print(f"  Type: {', '.join(SYNC_TYPES)}")
    sync_type = prompt("Type", "cross_functional_sync")
    if sync_type not in SYNC_TYPES:
        sync_type = "other"
    duration_str = prompt("Duration (minutes)", "60")
    try:
        duration_minutes = int(duration_str) if duration_str else 60
    except ValueError:
        duration_minutes = 60
    purpose = prompt("Purpose", "Cross-functional alignment")
    category = prompt("Competency category", "STRATEGIC DIRECTION")
    evidence = prompt("Evidence (Practice Lead-level work)", "")
    impact = prompt("Impact", "")

    date_str = prompt("Date (YYYY-MM-DD)", datetime.now().strftime("%Y-%m-%d"))
    time_str = prompt("Time (HH:MM)", datetime.now().strftime("%H:%M"))

    record = {
        "date": date_str,
        "time": time_str or "",
        "participants": [p.strip() for p in participants.split(",") if p.strip()] if participants else [],
        "topic": topic,
        "type": sync_type,
        "duration_minutes": duration_minutes,
        "purpose": purpose,
        "category": category,
        "evidence": evidence,
        "impact": impact,
        "sc_leveling_criteria": [],
    }

    print("\n--- Preview ---")
    for k, v in record.items():
        print(f"  {k}: {v}")
    confirm = input("\nSave? (y/n) [y]: ").strip().lower()
    if confirm and confirm != "y":
        print("Aborted.")
        sys.exit(0)

    add_activity(data, "product_sync", record)
    print("\nSaved. Product/Engineering collaboration added.")


if __name__ == "__main__":
    main()
