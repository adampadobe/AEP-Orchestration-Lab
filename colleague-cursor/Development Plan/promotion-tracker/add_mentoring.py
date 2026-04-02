#!/usr/bin/env python3
"""Add a mentoring session to the promotion tracker. Run: python add_mentoring.py"""
import sys
from datetime import datetime

from data_utils import load_data, add_activity, COMPETENCY_CATEGORIES, save_data, update_metadata


def prompt(prompt_text, default=""):
    val = input(f"  {prompt_text} [{default}]: ").strip() if default else input(f"  {prompt_text}: ").strip()
    return val if val else default


def main():
    print("\n--- Add Mentoring Session ---\n")
    data = load_data()

    person_name = prompt("Mentee name", "")
    if not person_name:
        print("Mentee name is required.")
        sys.exit(1)
    person_role = prompt("Mentee role (e.g. SC, AE)", "SC")
    topics = prompt("Topics covered (comma-separated)", "")
    topics_list = [t.strip() for t in topics.split(",") if t.strip()] if topics else []
    duration_str = prompt("Duration (minutes)", "60")
    try:
        duration_minutes = int(duration_str) if duration_str else 60
    except ValueError:
        duration_minutes = 60
    purpose = prompt("Purpose of session", "Capability building")
    category = prompt("Competency category", "PROFESSIONAL DEVELOPMENT")
    if category not in COMPETENCY_CATEGORIES:
        print(f"  Valid: {', '.join(COMPETENCY_CATEGORIES)}")
    evidence = prompt("Evidence (how this shows Practice Lead-level work)", "")
    impact = prompt("Impact (measurable outcomes)", "")
    follow_up = prompt("Follow-up planned? (y/n)", "n")
    follow_up_planned = follow_up.lower().startswith("y")
    follow_up_notes = prompt("Follow-up notes (if any)", "") if follow_up_planned else ""
    follow_up_done = prompt("Follow-up completed? (y/n)", "n") if follow_up_planned else "n"
    follow_up_completed = follow_up_done.lower().startswith("y")

    date_str = prompt("Date (YYYY-MM-DD)", datetime.now().strftime("%Y-%m-%d"))
    time_str = prompt("Time (HH:MM or leave blank)", datetime.now().strftime("%H:%M"))

    record = {
        "date": date_str,
        "time": time_str or "",
        "person_name": person_name,
        "person_role": person_role,
        "topics": topics_list,
        "duration_minutes": duration_minutes,
        "purpose": purpose,
        "category": category,
        "evidence": evidence,
        "impact": impact,
        "follow_up_planned": follow_up_planned,
        "follow_up_completed": follow_up_completed,
        "follow_up_notes": follow_up_notes,
        "sc_leveling_criteria": [],
    }

    print("\n--- Preview ---")
    for k, v in record.items():
        print(f"  {k}: {v}")
    confirm = input("\nSave? (y/n) [y]: ").strip().lower()
    if confirm and confirm != "y":
        print("Aborted.")
        sys.exit(0)

    add_activity(data, "mentoring", record)
    print("\nSaved. Mentoring session added.")


if __name__ == "__main__":
    main()
