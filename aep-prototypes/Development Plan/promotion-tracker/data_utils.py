"""
Shared data layer for the promotion tracker.
Loads/saves promotion_data.json and updates metadata.
"""
import json
import os
from datetime import datetime
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parent / "promotion_data.json"

# Practice Lead competency categories (from SC Levelling Guide)
COMPETENCY_CATEGORIES = [
    "SCOPE OF RESPONSIBILITY",
    "INFLUENCE",
    "STRATEGIC DIRECTION",
    "FUNCTIONAL KNOWLEDGE",
    "CUSTOMER ENGAGEMENT",
    "PROJECT MANAGEMENT SKILLS",
    "TEAM CONTRIBUTION",
    "PROFESSIONAL DEVELOPMENT",
]


def load_data():
    """Load the full promotion database from JSON."""
    if not DATA_FILE.exists():
        return {
            "mentoring": [],
            "product_sync": [],
            "strategic_customer": [],
            "innovation": [],
            "community": [],
            "certifications": [],
            "deals": [],
            "metadata": {
                "last_updated": None,
                "totals": {
                    "mentoring": 0,
                    "product_sync": 0,
                    "strategic_customer": 0,
                    "innovation": 0,
                    "community": 0,
                    "certifications": 0,
                    "deals": 0,
                },
                "unique_mentees": 0,
                "mentoring_hours": 0,
                "sustained_relationships_count": 0,
            },
        }
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    """Save data and refresh metadata."""
    update_metadata(data)
    data["metadata"]["last_updated"] = datetime.now().isoformat()
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def update_metadata(data):
    """Recalculate and set metadata totals and derived metrics."""
    m = data["metadata"]
    m["totals"]["mentoring"] = len(data["mentoring"])
    m["totals"]["product_sync"] = len(data["product_sync"])
    m["totals"]["strategic_customer"] = len(data["strategic_customer"])
    m["totals"]["innovation"] = len(data["innovation"])
    m["totals"]["community"] = len(data["community"])
    m["totals"]["certifications"] = len(data["certifications"])
    m["totals"]["deals"] = len(data["deals"])

    # Unique mentees
    mentees = set()
    hours = 0
    for r in data["mentoring"]:
        name = (r.get("person_name") or "").strip()
        if name:
            mentees.add(name)
        duration = r.get("duration_minutes") or 0
        if isinstance(duration, (int, float)):
            hours += duration / 60.0
    m["unique_mentees"] = len(mentees)
    m["mentoring_hours"] = round(hours, 1)

    # Sustained relationships: people with 2+ mentoring sessions
    from collections import Counter
    counts = Counter((r.get("person_name") or "").strip() for r in data["mentoring"] if (r.get("person_name") or "").strip())
    m["sustained_relationships_count"] = sum(1 for c in counts.values() if c >= 2)


def add_activity(data, activity_type, record):
    """Append an activity record and assign id/created_at. Then save."""
    record["id"] = record.get("id") or datetime.now().strftime("%Y%m%d%H%M%S")
    record["created_at"] = datetime.now().isoformat()
    if activity_type not in data:
        data[activity_type] = []
    data[activity_type].append(record)
    save_data(data)
    return record


def generate_id():
    return datetime.now().strftime("%Y%m%d%H%M%S")
