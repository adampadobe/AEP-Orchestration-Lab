#!/usr/bin/env python3
"""Add a strategic customer engagement. Run: python add_strategic_customer.py"""
import sys
from datetime import datetime

from data_utils import load_data, add_activity, COMPETENCY_CATEGORIES


def prompt(prompt_text, default=""):
    val = input(f"  {prompt_text} [{default}]: ").strip() if default else input(f"  {prompt_text}: ").strip()
    return val if val else default


ENGAGEMENT_TYPES = ["strategic_account", "executive_meeting", "complex_deal", "business_outcome_focus", "other"]


def main():
    print("\n--- Add Strategic Customer Engagement ---\n")
    data = load_data()

    account_name = prompt("Account / customer name", "")
    if not account_name:
        print("Account name is required.")
        sys.exit(1)
    print(f"  Engagement type: {', '.join(ENGAGEMENT_TYPES)}")
    engagement_type = prompt("Engagement type", "strategic_account")
    if engagement_type not in ENGAGEMENT_TYPES:
        engagement_type = "other"
    participants_role = prompt("Who did you meet (roles, e.g. C-level, VP)", "")
    duration_str = prompt("Duration (minutes)", "60")
    try:
        duration_minutes = int(duration_str) if duration_str else 60
    except ValueError:
        duration_minutes = 60
    purpose = prompt("Purpose", "Strategic alignment")
    revenue_impact = prompt("Revenue/pipeline impact (e.g. $ amount or description)", "")
    category = prompt("Competency category", "CUSTOMER ENGAGEMENT")
    evidence = prompt("Evidence (Practice Lead-level work)", "")
    impact = prompt("Impact / outcome", "")

    date_str = prompt("Date (YYYY-MM-DD)", datetime.now().strftime("%Y-%m-%d"))
    time_str = prompt("Time (HH:MM)", datetime.now().strftime("%H:%M"))

    record = {
        "date": date_str,
        "time": time_str or "",
        "account_name": account_name,
        "engagement_type": engagement_type,
        "participants_role": participants_role,
        "duration_minutes": duration_minutes,
        "purpose": purpose,
        "revenue_pipeline_impact": revenue_impact,
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

    add_activity(data, "strategic_customer", record)
    print("\nSaved. Strategic customer engagement added.")


if __name__ == "__main__":
    main()
