"""Verify HTTP failure propagation without server or connector dependencies."""

import ast
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch


class RunnerResponse(unittest.TestCase):
    def test_recent_capability_is_signed_and_invalid_mode_cannot_configure_snowflake(self):
        source = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text())
        functions = [node for node in source.body if isinstance(node, ast.AsyncFunctionDef)
                     and node.name in ("internal_enrich", "internal_capabilities")]
        for node in functions:
            node.decorator_list = []
        settings = Mock()
        verify = Mock()
        env = {
            "Request": object, "Response": lambda **kwargs: SimpleNamespace(**kwargs),
            "json": json, "_verify_signature": verify, "HTTPException": lambda status, detail: ValueError(detail),
            "_snowflake_kwargs_from_json": Mock(return_value={}), "snowflake_settings": settings,
        }
        exec(compile(ast.Module(body=functions, type_ignores=[]), "server.py", "exec"), env)
        request = SimpleNamespace(body=AsyncMock(return_value=b"{}"), headers={"X-Runner-Signature": "offline"})
        response = asyncio.run(env["internal_capabilities"](request))
        self.assertEqual(json.loads(response.content)["event_time_modes"], ["historical", "recent"])
        verify.assert_called_once_with(b"{}", "offline")
        for mode in (None, "future"):
            request.body = AsyncMock(return_value=json.dumps({"event_time_mode": mode}).encode())
            with self.assertRaisesRegex(ValueError, "historical or recent"):
                asyncio.run(env["internal_enrich"](request))
        env["_snowflake_kwargs_from_json"].assert_not_called()
        settings.set_connection_kwargs.assert_not_called()

    def test_generate_and_enrich_propagate_success_failure_and_missing_result(self):
        source = ast.parse((Path(__file__).resolve().parents[1] / "server.py").read_text())
        functions = [node for node in source.body if isinstance(node, ast.AsyncFunctionDef)
                     and node.name in ("internal_enrich", "internal_generate")]
        for node in functions:
            node.decorator_list = []
        for operation, status_key in [("generate", "generation_status"), ("enrich", "enrichment_status")]:
            for last_result, expected_status in [
                ({"success": True}, 200), ({"success": False}, 500), ({}, 500), (None, 500),
            ]:
                with self.subTest(operation=operation, last_result=last_result):
                    status = {}
                    wa = SimpleNamespace(**{status_key: status})
                    callback = Mock(side_effect=lambda *args: status.update(last_result=last_result))
                    setattr(wa, "generate_data_background" if operation == "generate"
                            else "enrich_profiles_background", callback)
                    env = {
                        "Request": object, "Response": lambda **kwargs: SimpleNamespace(**kwargs),
                        "json": json, "_verify_signature": Mock(),
                        "_snowflake_kwargs_from_json": Mock(return_value={}),
                        "snowflake_settings": Mock(),
                    }
                    exec(compile(ast.Module(body=functions, type_ignores=[]), "server.py", "exec"), env)
                    request = SimpleNamespace(
                        body=AsyncMock(return_value=json.dumps({
                            "count": 1, "profiles": [{"crmId": "offline"}],
                            "event_types": ["website"], "snowflake": {},
                        }).encode()),
                        headers={},
                    )
                    with patch.dict("sys.modules", {"web_app": wa}):
                        response = asyncio.run(env[f"internal_{operation}"](request))
                    payload = json.loads(response.content)
                    self.assertEqual(response.status_code, expected_status)
                    self.assertEqual(payload["success"], expected_status == 200)
                    if expected_status == 500:
                        self.assertIn("writes may be partial", payload["message"])
                        self.assertIn("Inspect stored rows", payload["message"])
                    callback.assert_called_once()


if __name__ == "__main__":
    unittest.main()
