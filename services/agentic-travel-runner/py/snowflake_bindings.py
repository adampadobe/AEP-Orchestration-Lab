"""Typed bindings for the fixed Travel recipe; keep parity with its DDL."""

import json
import re

STRUCTURED_COLUMNS = {
    "AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE": {"PUSHTOKENS": "ARRAY"},
    "AGENTIC_TRAVEL_PROFILE_CUSTOMER": {
        "PUSHTOKENS": "ARRAY", "FAVORITEDESTINATIONS": "ARRAY", "SPECIALASSISTANCE": "ARRAY",
    },
    "AGENTIC_TRAVEL_EVENT_WEBSITE": {"PUSHTOKENS": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_BOOKING": {"PUSHTOKENS": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_BOOKING_SEGMENTS": {},
    "AGENTIC_TRAVEL_EVENT_ANCILLARIES": {},
    "AGENTIC_TRAVEL_PROFILE_LOYALTY": {},
    "AGENTIC_TRAVEL_PROFILE_PREFERENCES": {},
    "AGENTIC_TRAVEL_EVENT_MOBILE": {"PUSHTOKENS": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_CALLCENTRE": {"PUSHTOKENS": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_CHECKIN": {"PUSHTOKENS": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_DISRUPTION": {"PUSHTOKENS": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_INFLIGHT": {"PUSHTOKENS": "ARRAY", "EXTRA_ITEMS": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_HOTEL": {"PUSHTOKENS": "ARRAY", "ITEMS_ORDERED": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_LOYALTY": {"PUSHTOKENS": "ARRAY", "TIER_BENEFITS_UNLOCKED": "ARRAY"},
    "AGENTIC_TRAVEL_EVENT_POS": {"PUSHTOKENS": "ARRAY", "ITEMS": "ARRAY", "ITEM_CATEGORIES": "ARRAY"},
}


def insert_rows(cursor, sql, rows):
    match = re.fullmatch(
        r"\s*INSERT INTO (AGENTIC_\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*;?\s*",
        sql, re.IGNORECASE,
    )
    if not match or match[1].upper() not in STRUCTURED_COLUMNS:
        raise ValueError("Expected an allowlisted Travel INSERT")
    table = match[1].upper()
    columns = [column.strip().upper() for column in match[2].split(",")]
    placeholders = [value.strip() for value in match[3].split(",")]
    if placeholders != ["%s"] * len(columns):
        raise ValueError("Travel INSERT columns and placeholders do not match")
    types = STRUCTURED_COLUMNS[table]
    expressions = [f"PARSE_JSON(%s)::{types[column]}" if column in types else "%s"
                   for column in columns]
    binds = []
    for row in rows:
        if len(row) != len(columns):
            raise ValueError("Travel INSERT row width does not match columns")
        values = list(row)
        for index, column in enumerate(columns):
            if column not in types or values[index] is None:
                continue
            value = json.loads(values[index]) if isinstance(values[index], str) else values[index]
            if types[column] == "ARRAY" and not isinstance(value, list):
                raise ValueError(f"{table}.{column} requires an array")
            values[index] = json.dumps(value)
        binds.append(tuple(values))
    if binds:
        cursor.executemany(f"INSERT INTO {table} ({', '.join(columns)}) SELECT {', '.join(expressions)}", binds)
