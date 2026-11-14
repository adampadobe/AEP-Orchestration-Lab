"""Exercise actual recent-mode generators offline, without connector imports."""

import ast
from datetime import datetime, timedelta, timezone
import hashlib
from pathlib import Path
import random
import sys
import unittest
import uuid

PY = Path(__file__).resolve().parents[1] / "py"
sys.path.insert(0, str(PY))
from event_time_mode import EventClock
from attribution_helper import AttributionHelper
from session_journey_helper import SessionJourneyHelper


def generator_class(filename, name):
    tree = ast.parse((PY / filename).read_text())
    node = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == name)
    namespace = {
        "datetime": datetime, "timedelta": timedelta, "random": random,
        "uuid": uuid, "hashlib": hashlib,
        "AttributionHelper": AttributionHelper, "SessionJourneyHelper": SessionJourneyHelper,
    }
    exec(compile(ast.Module(body=[node], type_ignores=[]), filename, "exec"), namespace)
    return namespace[name]


class RecentEventMode(unittest.TestCase):
    def test_real_generator_event_types_remain_recent_with_ordered_mobile_steps_and_new_ids(self):
        now = datetime(2026, 11, 15, 0, 0, 1)
        clock = EventClock("recent", now)
        profile = {"crmId": "CRM42", "ecid": "12345678901234567890",
                   "email": "offline@example.test", "loyaltyId": "LOY42", "phoneNumber": "+441234567890"}
        phase2 = generator_class("data_generator_phase2.py", "Phase2DataGenerator")(None, None)
        phase3 = generator_class("data_generator_phase3.py", "Phase3DataGenerator")(None, None)
        phase2.event_clock = phase3.event_clock = clock
        phase2.set_journey_flags({"CRM42": {"uses_mobile": True, "does_checkin": True, "calls_centre": True}})
        phase3.set_journey_flags({"CRM42": {"has_disruption": True, "uses_inflight": True,
                                          "uses_hotel": True, "has_loyalty": True, "uses_pos": True}})
        for generator, method in [
            (phase2, "generate_mobile_events"), (phase2, "generate_checkin_events"),
            (phase2, "generate_call_centre_events"), (phase3, "generate_disruption_events"),
            (phase3, "generate_inflight_events"), (phase3, "generate_hotel_events"),
            (phase3, "generate_loyalty_transactions"), (phase3, "generate_pos_events"),
        ]:
            with self.subTest(method=method):
                events = getattr(generator, method)([profile])
                self.assertTrue(events, "exercise real rows, not a conditional empty cohort")
                for event in events:
                    stamp = event[1] if isinstance(event[1], datetime) else datetime.fromisoformat(event[1])
                    self.assertLessEqual(stamp, now)
                    self.assertGreaterEqual(stamp, now - timedelta(hours=6))
                    self.assertTrue(event[0].startswith("recent-"))
                    self.assertLessEqual(len(event[0]), 50)
                if method == "generate_mobile_events":
                    self.assertEqual([row[1] for row in events], sorted(row[1] for row in events))
                if method == "generate_hotel_events":
                    event = events[0]
                    self.assertLessEqual(datetime.fromisoformat(event[25]), datetime.fromisoformat(event[1]))
                    self.assertLessEqual(datetime.fromisoformat(event[32]), datetime.fromisoformat(event[33]))
                    self.assertLessEqual(datetime.fromisoformat(event[33]), now)

    def test_booking_and_historical_timestamp_methods_do_not_silently_ignore_mode(self):
        cls = generator_class("data_generator.py", "TravelDataGenerator")
        generator = cls()
        now = datetime(2026, 11, 15, 0, 0, 1)
        generator.event_clock = EventClock("recent", now)
        profile = [None] * 39
        profile[:3] = ["CRM42", "12345678901234567890", "offline@example.test"]
        profile[10:13] = ["Offline", "Demo", "1990-01-01"]
        profile[28] = "economy"
        profile[35] = "silver"
        bookings = generator.generate_personalized_booking_events([tuple(profile)], 0)
        self.assertTrue(bookings)
        for booking in bookings:
            stamp = datetime.fromisoformat(booking[11])
            self.assertLessEqual(stamp, now)
            self.assertGreaterEqual(stamp, now - timedelta(hours=6))
            self.assertEqual(booking[15], booking[11])
            self.assertTrue(booking[10].startswith("recent-"))
            self.assertTrue(booking[13].startswith("recent-"))
        generator.event_clock = EventClock("historical", now)
        stamp = generator.generate_realistic_timestamp(days_ago=90, hour_range=(8, 8))
        self.assertEqual(stamp.hour, 8)
        self.assertEqual(stamp.date(), (datetime.utcnow() - timedelta(days=90)).date())

    def test_clock_is_request_local_utc_and_rejects_unknown_modes(self):
        for mode in ["RECENT", "unknown", "", None]:
            with self.assertRaises(ValueError):
                EventClock(mode)
        first = EventClock("recent", datetime(2026, 11, 15, 3, tzinfo=timezone(timedelta(hours=3))))
        second = EventClock("recent", first.now)
        self.assertEqual(first.now, datetime(2026, 11, 15))
        self.assertNotEqual(first.generation_id, second.generation_id)
        for _ in range(100):
            stamp = first.timestamp()
            self.assertGreaterEqual(stamp, first.now - timedelta(hours=6))
            self.assertLessEqual(stamp, first.now - timedelta(hours=1))


if __name__ == "__main__":
    unittest.main()
