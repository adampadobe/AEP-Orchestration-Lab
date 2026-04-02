#!/usr/bin/env python3
"""Add a deal / business impact. Run: python add_deal.py"""
import sys
from datetime import datetime

from data_utils import load_data, add_activity, COMPETENCY_CATEGORIES


def prompt(prompt_text, default=""):
    val = input(f"  {prompt_text} [{default}]: ").strip() if default else input(f"  {prompt_text}: ").strip()
    return val if val else default


ROLES = ["lead", "support", "technical_lead", "solution_owner", "other"]


def main():
    print("\n--- Add Deal / Business Impact ---\n")
    data = load_data()

    deal_name = prompt("Deal name / opportunity", "")
    customer_name = prompt("Customer / account name", "")
    print(f"  Your role: {', '.join(ROLES)}")
    role = prompt("Your role in deal", "technical_lead")
    if role not in ROLES:
        role = "other"
    pipeline_str = prompt("Pipeline amount ($ or description)", "")
    revenue_str = prompt("Revenue / closed amount ($ or leave blank)", "")
    outcome = prompt("Outcome (won, in progress, etc.)", "in progress")
    category = prompt("Competency category", "SCOPE OF RESPONSIBILITY")
    evidence = prompt("Evidence (Practice Lead-level work)", "")
    impact = prompt("Impact / business outcome", "")

    date_str = prompt("Date (YYYY-MM-DD)", datetime.now().strftime("%Y-%m-%d"))

    record = {
        "date": date_str,
        "deal_name": deal_name,
        "customer_name": customer_name,
        "role": role,
        "pipeline_amount": pipeline_str,
        "revenue_amount": revenue_str or None,
        "outcome": outcome,
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

    add_activity(data, "deals", record)
    print("\nSaved. Deal added.")


if __name__ == "__main__":
    main()
