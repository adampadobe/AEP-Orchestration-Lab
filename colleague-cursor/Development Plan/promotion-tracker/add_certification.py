#!/usr/bin/env python3
"""Add a certification. Run: python add_certification.py"""
import sys
from datetime import datetime

from data_utils import load_data, add_activity, COMPETENCY_CATEGORIES


def prompt(prompt_text, default=""):
    val = input(f"  {prompt_text} [{default}]: ").strip() if default else input(f"  {prompt_text}: ").strip()
    return val if val else default


STATUSES = ["current", "expired", "no_expiry"]


def main():
    print("\n--- Add Certification ---\n")
    data = load_data()

    name = prompt("Certification name", "")
    if not name:
        print("Certification name is required.")
        sys.exit(1)
    issuer = prompt("Issuer (e.g. Adobe, AWS)", "")
    date_earned = prompt("Date earned (YYYY-MM-DD)", datetime.now().strftime("%Y-%m-%d"))
    expiry = prompt("Expiry date (YYYY-MM-DD or leave blank for no expiry)", "")
    relevance = prompt("Relevance to role (short description)", "")
    print(f"  Status: {', '.join(STATUSES)}")
    status = prompt("Status", "current")
    if status not in STATUSES:
        status = "current"
    category = prompt("Competency category", "PROFESSIONAL DEVELOPMENT")
    evidence = prompt("Evidence (how it supports Practice Lead)", "")

    record = {
        "name": name,
        "issuer": issuer,
        "date_earned": date_earned,
        "expiry_date": expiry or None,
        "relevance_to_role": relevance,
        "status": status,
        "category": category,
        "evidence": evidence,
        "sc_leveling_criteria": [],
    }

    print("\n--- Preview ---")
    for k, v in record.items():
        print(f"  {k}: {v}")
    confirm = input("\nSave? (y/n) [y]: ").strip().lower()
    if confirm and confirm != "y":
        print("Aborted.")
        sys.exit(0)

    add_activity(data, "certifications", record)
    print("\nSaved. Certification added.")


if __name__ == "__main__":
    main()
