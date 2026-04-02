#!/usr/bin/env python3
"""Add a community/team event (workshop, presentation, doc, office hours). Run: python add_community.py"""
import sys
from datetime import datetime

from data_utils import load_data, add_activity, COMPETENCY_CATEGORIES


def prompt(prompt_text, default=""):
    val = input(f"  {prompt_text} [{default}]: ").strip() if default else input(f"  {prompt_text}: ").strip()
    return val if val else default


EVENT_TYPES = ["workshop", "presentation", "documentation", "office_hours", "lunch_learn", "summit_session", "webinar", "other"]


def main():
    print("\n--- Add Community / Team Event ---\n")
    data = load_data()

    title = prompt("Title of session / doc / event", "")
    if not title:
        print("Title is required.")
        sys.exit(1)
    print(f"  Type: {', '.join(EVENT_TYPES)}")
    event_type = prompt("Type", "workshop")
    if event_type not in EVENT_TYPES:
        event_type = "other"
    audience_str = prompt("Approximate audience count", "0")
    try:
        audience_count = int(audience_str) if audience_str else 0
    except ValueError:
        audience_count = 0
    topics = prompt("Topics (comma-separated)", "")
    topics_list = [t.strip() for t in topics.split(",") if t.strip()] if topics else []
    duration_str = prompt("Duration (minutes)", "60")
    try:
        duration_minutes = int(duration_str) if duration_str else 60
    except ValueError:
        duration_minutes = 60
    category = prompt("Competency category", "TEAM CONTRIBUTION")
    evidence = prompt("Evidence (Practice Lead-level work)", "")
    impact = prompt("Impact", "")

    date_str = prompt("Date (YYYY-MM-DD)", datetime.now().strftime("%Y-%m-%d"))
    time_str = prompt("Time (HH:MM)", "")

    record = {
        "date": date_str,
        "time": time_str or "",
        "title": title,
        "type": event_type,
        "audience_count": audience_count,
        "topics": topics_list,
        "duration_minutes": duration_minutes,
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

    add_activity(data, "community", record)
    print("\nSaved. Community event added.")


if __name__ == "__main__":
    main()
