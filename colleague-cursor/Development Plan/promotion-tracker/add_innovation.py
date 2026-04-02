#!/usr/bin/env python3
"""Add an innovation (tool, process, reusable asset). Run: python add_innovation.py"""
import sys
from datetime import datetime

from data_utils import load_data, add_activity, COMPETENCY_CATEGORIES


def prompt(prompt_text, default=""):
    val = input(f"  {prompt_text} [{default}]: ").strip() if default else input(f"  {prompt_text}: ").strip()
    return val if val else default


INNOVATION_TYPES = ["tool_technique", "process_improvement", "reusable_asset", "complex_problem_solved", "other"]


def main():
    print("\n--- Add Innovation / Thought Leadership ---\n")
    data = load_data()

    title = prompt("Title / name of innovation", "")
    if not title:
        print("Title is required.")
        sys.exit(1)
    description = prompt("Description", "")
    print(f"  Type: {', '.join(INNOVATION_TYPES)}")
    inv_type = prompt("Type", "tool_technique")
    if inv_type not in INNOVATION_TYPES:
        inv_type = "other"
    adoption_str = prompt("Team adoption count (how many people use/adopted)", "0")
    try:
        team_adoption_count = int(adoption_str) if adoption_str else 0
    except ValueError:
        team_adoption_count = 0
    category = prompt("Competency category", "FUNCTIONAL KNOWLEDGE")
    evidence = prompt("Evidence (Practice Lead-level work)", "")
    impact = prompt("Impact (measurable outcomes)", "")

    date_str = prompt("Date introduced (YYYY-MM-DD)", datetime.now().strftime("%Y-%m-%d"))

    record = {
        "date": date_str,
        "title": title,
        "description": description,
        "type": inv_type,
        "team_adoption_count": team_adoption_count,
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

    add_activity(data, "innovation", record)
    print("\nSaved. Innovation added.")


if __name__ == "__main__":
    main()
