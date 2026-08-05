import importlib.util
import pathlib
import unittest


SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "pipedrive-email-crossref.py"
spec = importlib.util.spec_from_file_location("pipedrive_email_crossref", SCRIPT_PATH)
crossref = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crossref)


class PipedriveEmailCrossrefTests(unittest.TestCase):
    def test_duplicate_pipedrive_matches_emit_one_alert_using_latest_activity(self):
        hot_deal = {
            "id": "malone-five-below",
            "name": "Five Below",
            "property": "Malone Plaza",
            "timeline": [{"date": "2026-08-05", "event": "Recent email", "type": "email"}],
        }
        pd_deals = [
            {"title": "Five Below - Malone", "update_time": "2026-03-26 09:00:00"},
            {"title": "Five Below Malone Plaza", "update_time": "2026-05-04 09:00:00"},
        ]

        alerts = crossref.compute_cross_ref_alerts([hot_deal], pd_deals, stale_days=14)

        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["deal"], "Five Below")
        self.assertEqual(alerts[0]["details"]["lastPipedriveDate"], "2026-05-04")


if __name__ == "__main__":
    unittest.main()
