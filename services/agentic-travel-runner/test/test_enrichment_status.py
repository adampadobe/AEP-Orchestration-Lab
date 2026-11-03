"""Exercise runner orchestration offline, without importing connector packages."""

import ast
import contextlib
from datetime import datetime
import io
from pathlib import Path
import random
import unittest
from unittest.mock import Mock

PY = Path(__file__).resolve().parents[1] / "py"
EVENTS = {
    "mobile": ("phase2", "generate_mobile_events", "insert_mobile_events", "mobile_events"),
    "checkin": ("phase2", "generate_checkin_events", "insert_checkin_events", "checkin_events"),
    "call": ("phase2", "generate_call_centre_events", "insert_call_centre_events", "call_events"),
    "disruption": ("phase3", "generate_disruption_events", "insert_disruption_events", "disruption_events"),
    "inflight": ("phase3", "generate_inflight_events", "insert_inflight_events", "inflight_events"),
    "hotel": ("phase3", "generate_hotel_events", "insert_hotel_events", "hotel_events"),
    "loyalty": ("phase3", "generate_loyalty_transactions", "insert_loyalty_transactions", "loyalty_events"),
    "pos": ("phase3", "generate_pos_events", "insert_pos_events", "pos_events"),
}
PROFILES = [
    {"crmId": f"CRM-{i}", "ecid": f"ECID-{i}", "email": f"offline-{i}@example.test",
     "loyaltyId": f"LOYALTY-{i}"}
    for i in range(10)
]


class EnrichmentStatus(unittest.TestCase):
    def setUp(self):
        self.generator = Mock()
        self.generator.generate_realistic_timestamp.return_value = datetime(2026, 1, 1)
        self.generator.generate_personalized_booking_events.return_value = [("booking",)]
        self.generator.cursor.fetchall.return_value = [("profile",)]
        self.phases = {"phase2": Mock(), "phase3": Mock()}
        for phase, generate, _, _ in EVENTS.values():
            getattr(self.phases[phase], generate).side_effect = (
                lambda profiles, **kwargs: [("event",)] if profiles else []
            )
        self.env = {
            "TravelDataGenerator": Mock(return_value=self.generator),
            "Phase2DataGenerator": Mock(return_value=self.phases["phase2"]),
            "Phase3DataGenerator": Mock(return_value=self.phases["phase3"]),
            "insert_rows": Mock(),
            "random": random.Random(7),
            "generation_status": {},
            "enrichment_status": {},
        }
        source = ast.parse((PY / "web_app.py").read_text())
        functions = [node for node in source.body if isinstance(node, ast.FunctionDef)
                     and node.name in ("enrich_profiles_background", "generate_data_background")]
        exec(compile(ast.Module(body=functions, type_ignores=[]), "web_app.py", "exec"), self.env)

    def enrich(self, event_types, profiles=PROFILES):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.env["enrich_profiles_background"](profiles, event_types)
        self.assertFalse(self.env["enrichment_status"]["running"])
        self.generator.close.assert_called_once()
        return self.env["enrichment_status"]["last_result"]

    def test_every_event_type_inserts_before_reporting_success(self):
        result = self.enrich(["website", "booking", *EVENTS])
        self.assertTrue(result["success"])
        self.env["insert_rows"].assert_called_once()
        self.assertGreater(result["website_events"], 0)
        self.generator.insert_booking_events.assert_called_once_with([("booking",)])
        self.assertEqual(result["booking_events"], 1)
        for phase, _, insert, counter in EVENTS.values():
            getattr(self.phases[phase], insert).assert_called_once_with([("event",)])
            self.assertEqual(result[counter], 1)

    def test_each_insert_failure_returns_failure_not_zero_row_success(self):
        for event_type in ["website", "booking", *EVENTS]:
            with self.subTest(event_type=event_type):
                self.setUp()
                if event_type == "website":
                    insert = self.env["insert_rows"]
                elif event_type == "booking":
                    insert = self.generator.insert_booking_events
                else:
                    phase, _, method, _ = EVENTS[event_type]
                    insert = getattr(self.phases[phase], method)
                insert.side_effect = RuntimeError("offline insert failure")
                result = self.enrich([event_type])
                self.assertFalse(result["success"])
                self.assertEqual(result["error"], "offline insert failure")
                self.assertEqual(result["write_state"], "potentially_partial")
                self.assertIn("Inspect stored rows", result["retry_guidance"])
                self.assertNotEqual(self.env["enrichment_status"]["progress"], 100)
                insert.assert_called_once()

    def test_later_failure_stops_remaining_writes_and_warns_about_partial_state(self):
        self.phases["phase3"].insert_hotel_events.side_effect = RuntimeError("offline failure")
        result = self.enrich(["website", "hotel", "pos"])
        self.env["insert_rows"].assert_called_once()
        self.assertFalse(result["success"])
        self.assertEqual(result["write_state"], "potentially_partial")
        self.phases["phase3"].generate_pos_events.assert_not_called()

    def test_conditional_zero_rows_is_still_valid(self):
        result = self.enrich(["mobile", "booking", "checkin", "call", "disruption", "loyalty"],
                             [{"crmId": "CRM-one", "ecid": "ECID-one",
                               "email": "one@example.test"}])
        self.assertTrue(result["success"])
        self.assertTrue(all(value == 0 for key, value in result.items() if key.endswith("_events")))
        self.generator.insert_booking_events.assert_not_called()

    def test_full_generation_does_not_hide_phase3_failure(self):
        self.generator.generate_and_insert.return_value = {
            "success": True, "crm_ids": ["CRM-one"], "ecids": ["ECID-one"],
            "emails": ["one@example.test"], "start_index": 1,
        }
        self.generator.cursor.fetchall.return_value = [("CRM-one", None)]
        self.phases["phase3"].generate_and_insert_all.return_value = {
            "success": False, "error": "offline phase3 failure",
        }
        with contextlib.redirect_stdout(io.StringIO()):
            self.env["generate_data_background"](1)
        result = self.env["generation_status"]["last_result"]
        self.assertFalse(result["success"])
        self.assertIn("Phase 3 generation failed", result["error"])
        self.assertFalse(self.env["generation_status"]["running"])
        self.generator.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
