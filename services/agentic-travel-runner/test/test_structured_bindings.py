"""Offline binding tests; no connector, credentials or customer data."""

import ast
import importlib.util
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PY = ROOT / "services/agentic-travel-runner/py"
spec = importlib.util.spec_from_file_location("snowflake_bindings", PY / "snowflake_bindings.py")
bindings = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bindings)


class Cursor:
    def __init__(self):
        self.calls = []

    def executemany(self, sql, rows):
        if not re.search(r"\bVALUES\s*\(", sql, re.I):
            raise RuntimeError("252001: executemany INSERT requires a VALUES clause")
        self.calls.append((sql, rows))

    def execute(self, sql, row):
        self.calls.append((sql, row))


class StructuredBindings(unittest.TestCase):
    def test_exact_type_parity_for_all_sixteen_tables(self):
        definitions = json.loads((ROOT / "functions/snowflakeTravelTableDefinitions.json").read_text())
        expected = {}
        for entry in definitions:
            expected[entry["table"]] = dict(
                re.match(r"(\w+)\s+(ARRAY|VARIANT|OBJECT)\b", ddl).groups()
                for ddl in entry["columnDdl"] if re.match(r"\w+\s+(ARRAY|VARIANT|OBJECT)\b", ddl)
            )
        self.assertEqual(len(expected), 16)
        self.assertEqual(bindings.STRUCTURED_COLUMNS, expected)

    def test_null_empty_populated_and_json_encoded_arrays(self):
        for table, types in bindings.STRUCTURED_COLUMNS.items():
            for column, column_type in types.items():
                for value in [None, [], ["demo"], '["demo"]']:
                    cursor = Cursor()
                    bindings.insert_rows(cursor, f"INSERT INTO {table} (CRMID, {column}) VALUES (%s, %s)",
                                         [("CRM-offline", value)])
                    sql, row = cursor.calls[0]
                    self.assertIn(f"SELECT %s, PARSE_JSON(%s)::{column_type}", sql)
                    self.assertEqual(row[1], None if value is None else json.dumps(
                        json.loads(value) if isinstance(value, str) else value))

    def test_multiple_rows_use_connector_compatible_execute_and_preserve_order(self):
        cursor = Cursor()
        bindings.insert_rows(
            cursor,
            "INSERT INTO AGENTIC_TRAVEL_EVENT_WEBSITE (CRMID, PUSHTOKENS) VALUES (%s, %s)",
            [("first", ["token"]), ("second", []), ("third", None)],
        )
        self.assertEqual([row for _, row in cursor.calls],
                         [("first", '["token"]'), ("second", "[]"), ("third", None)])
        self.assertTrue(all("PARSE_JSON(%s)::ARRAY" in sql for sql, _ in cursor.calls))

    def test_empty_batch_does_not_execute(self):
        cursor = Cursor()
        bindings.insert_rows(cursor, "INSERT INTO AGENTIC_TRAVEL_EVENT_WEBSITE (CRMID) VALUES (%s)", [])
        self.assertEqual(cursor.calls, [])

    def test_execution_error_is_not_swallowed_or_retried(self):
        class FailingCursor(Cursor):
            def execute(self, sql, row):
                super().execute(sql, row)
                raise RuntimeError("insert failed")

        cursor = FailingCursor()
        with self.assertRaisesRegex(RuntimeError, "insert failed"):
            bindings.insert_rows(
                cursor, "INSERT INTO AGENTIC_TRAVEL_EVENT_WEBSITE (CRMID) VALUES (%s)",
                [("first",), ("second",)],
            )
        self.assertEqual(len(cursor.calls), 1)

    def test_all_generator_inserts_use_typed_helper_with_correct_widths(self):
        for path in [*PY.glob("data_generator*.py"), PY / "web_app.py"]:
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                    self.assertNotEqual(node.func.attr, "executemany", path.name)
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    if re.match(r"\s*INSERT INTO AGENTIC_", node.value):
                        cursor = Cursor()
                        count = len(re.search(r"\(([^)]+)\)", node.value)[1].split(","))
                        bindings.insert_rows(cursor, node.value, [tuple(None for _ in range(count))])
                        self.assertEqual(len(cursor.calls), 1)

    def test_rejects_bad_shapes_before_any_execution(self):
        cursor = Cursor()
        sql = "INSERT INTO AGENTIC_TRAVEL_PROFILE_CUSTOMER (FAVORITEDESTINATIONS) VALUES (%s)"
        for rows in [[("not-json",)], [({},)], [("[]", "extra")], [([],), ("not-json",)]]:
            with self.assertRaises((ValueError, json.JSONDecodeError)):
                bindings.insert_rows(cursor, sql, rows)
        self.assertEqual(cursor.calls, [])


if __name__ == "__main__":
    unittest.main()
