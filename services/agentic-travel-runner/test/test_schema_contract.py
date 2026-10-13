"""Offline contract tests: no imports of connector packages or live credentials."""
import ast
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PY = ROOT / "services/agentic-travel-runner/py"
DEFINITIONS = json.loads((ROOT / "functions/snowflakeTravelTableDefinitions.json").read_text())
TABLES = {entry["table"]: entry["columnDdl"] for entry in DEFINITIONS}


class TravelSchemaContract(unittest.TestCase):
    def test_every_generator_insert_has_provisioned_table_and_columns(self):
        inserted = set()
        for path in PY.glob("data_generator*.py"):
            for node in ast.walk(ast.parse(path.read_text())):
                if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
                    continue
                for table, columns in re.findall(r"INSERT INTO (AGENTIC_\w+)\s*\(([^)]+)\)", node.value):
                    inserted.add(table)
                    self.assertIn(table, TABLES)
                    declared = {ddl.split()[0] for ddl in TABLES[table]}
                    self.assertFalse(set(re.findall(r"\b[A-Z_][A-Z0-9_]*\b", columns)) - declared, table)
        self.assertEqual(len(inserted), 14)

    def test_booking_detail_recipe_matches_runner_create_sql(self):
        tree = ast.parse((PY / "data_generator.py").read_text())
        generator = next(node for node in tree.body if isinstance(node, ast.ClassDef))
        for method_name, table in [
            ("ensure_booking_segments_table", "AGENTIC_TRAVEL_EVENT_BOOKING_SEGMENTS"),
            ("ensure_ancillaries_table", "AGENTIC_TRAVEL_EVENT_ANCILLARIES"),
        ]:
            method = next(node for node in generator.body if getattr(node, "name", None) == method_name)
            sql = next(node.value for node in ast.walk(method)
                       if isinstance(node, ast.Constant) and isinstance(node.value, str)
                       and "CREATE TABLE IF NOT EXISTS" in node.value)
            expected = f"CREATE TABLE IF NOT EXISTS {table} ({', '.join(TABLES[table])})"
            normalize = lambda text: re.sub(r"\s+", "", text)
            self.assertEqual(normalize(sql), normalize(expected))

    def test_executable_sql_uses_request_connection_not_adams_target(self):
        for path in PY.glob("*.py"):
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Module)):
                    if node.body and isinstance(node.body[0], ast.Expr):
                        if isinstance(node.body[0].value, ast.Constant):
                            node.body = node.body[1:]
            for node in ast.walk(tree):
                if isinstance(node, ast.Constant) and isinstance(node.value, str):
                    if re.search(r"\b(?:SELECT|INSERT|MERGE|CREATE)\b", node.value, re.I):
                        self.assertNotIn("TRAVEL_DATABASE.", node.value, path.name)
                        self.assertNotIn("AEP_SCHEMA.", node.value, path.name)


if __name__ == "__main__":
    unittest.main()
