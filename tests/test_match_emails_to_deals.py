import copy
import importlib.util
import pathlib
import unittest


SCRIPT_PATH = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "match-emails-to-deals.py"
spec = importlib.util.spec_from_file_location("match_emails_to_deals", SCRIPT_PATH)
matcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(matcher)


class MatchEmailsToDealsTests(unittest.TestCase):
    def make_data(self, *deals):
        return {
            "pipelineDeals": [copy.deepcopy(deal) for deal in deals],
            "sideDeals": [],
            "staleContacts": [],
        }

    def test_pell_city_docusign_email_does_not_match_unrelated_deals_or_advance_stage(self):
        five_below = {
            "id": "malone-five-below",
            "name": "Five Below",
            "property": "Malone Plaza",
            "stage": "LOI",
            "priority": "high",
            "contacts": ["Micah Lacher", "Desiree Warren (Five Below)"],
            "timeline": [],
        }
        marshalls = {
            "id": "malone-marshalls",
            "name": "Marshalls",
            "property": "Malone Plaza",
            "stage": "LOI",
            "priority": "medium",
            "contacts": ["Micah Lacher", "Joseph Landry (TJX)"],
            "timeline": [],
        }
        pell_city = {
            "id": "pell-city",
            "name": "",
            "property": "Pell City Marketplace",
            "stage": "LOI",
            "priority": "high",
            "contacts": ["Lauri Fowler (ProStar)", "David Cooke (Cooke Commercial)"],
            "timeline": [],
        }
        email = {
            "subject": "Fwd: Completed: Complete with Docusign: Pell City Partners - Upstream Growth par",
            "snippet": "Completed: Complete with Docusign: Pell City Partners - Upstream Growth partners document.",
            "from": "Micah Lacher <micah@example.com>",
            "to": "Jacob Delk <jacob@example.com>",
            "date": "2026-08-04T12:00:00",
        }

        updated = matcher.match_and_update(self.make_data(five_below, marshalls, pell_city), [email])
        updated_deals = {deal["id"]: deal for deal in updated["pipelineDeals"]}

        self.assertEqual(updated_deals["malone-five-below"]["timeline"], [])
        self.assertEqual(updated_deals["malone-five-below"]["stage"], "LOI")
        self.assertNotIn("stageOverride", updated_deals["malone-five-below"])

        self.assertEqual(updated_deals["malone-marshalls"]["timeline"], [])
        self.assertEqual(updated_deals["malone-marshalls"]["stage"], "LOI")
        self.assertNotIn("stageOverride", updated_deals["malone-marshalls"])

        self.assertEqual(len(updated_deals["pell-city"]["timeline"]), 1)
        self.assertEqual(updated_deals["pell-city"]["stage"], "LOI")
        self.assertNotIn("stageOverride", updated_deals["pell-city"])

    def test_legitimate_tenant_match_can_advance_stage(self):
        deal = {
            "id": "malone-five-below",
            "name": "Five Below",
            "property": "Malone Plaza",
            "stage": "LOI",
            "priority": "high",
            "contacts": ["Desiree Warren (Five Below)"],
            "timeline": [],
        }
        email = {
            "subject": "Five Below lease fully executed",
            "snippet": "All parties signed and lease executed.",
            "from": "Desiree Warren <desiree@example.com>",
            "date": "2026-08-04T12:00:00",
        }

        updated = matcher.match_and_update(self.make_data(deal), [email])
        updated_deal = updated["pipelineDeals"][0]

        self.assertEqual(len(updated_deal["timeline"]), 1)
        self.assertEqual(updated_deal["stage"], "Lease Signed")
        self.assertEqual(updated_deal["stageOverride"], "Lease Signed")

    def test_legitimate_property_match_adds_timeline_entry(self):
        deal = {
            "id": "pell-city",
            "name": "",
            "property": "Pell City Marketplace",
            "stage": "Contact Made",
            "priority": "medium",
            "contacts": ["Lauri Fowler (ProStar)"],
            "timeline": [],
        }
        email = {
            "subject": "Pell City Marketplace estoppel request",
            "snippet": "Please review the latest Pell City Marketplace package.",
            "from": "Closing Team <closing@example.com>",
            "date": "2026-08-04T12:00:00",
        }

        updated = matcher.match_and_update(self.make_data(deal), [email])
        updated_deal = updated["pipelineDeals"][0]

        self.assertEqual(len(updated_deal["timeline"]), 1)
        self.assertEqual(updated_deal["stage"], "Contact Made")
        self.assertNotIn("stageOverride", updated_deal)

    def test_shared_contact_only_email_is_not_auto_matched(self):
        deal = {
            "id": "pell-city-803-martin-compassus",
            "name": "Compassus",
            "property": "Pell City / 803 Martin St S",
            "stage": "LOI",
            "priority": "high",
            "contacts": ["David Cooke (Cooke Commercial)"],
            "timeline": [],
        }
        email = {
            "subject": "Completed: Complete with Docusign",
            "snippet": "The document is complete with Docusign.",
            "from": "David Cooke <david@example.com>",
            "date": "2026-08-04T12:00:00",
        }

        updated = matcher.match_and_update(self.make_data(deal), [email])
        updated_deal = updated["pipelineDeals"][0]

        self.assertEqual(updated_deal["timeline"], [])
        self.assertEqual(updated_deal["stage"], "LOI")
        self.assertNotIn("stageOverride", updated_deal)

    def test_legitimate_contact_and_tenant_match_can_advance_stage(self):
        deal = {
            "id": "pell-city-803-martin-compassus",
            "name": "Compassus",
            "property": "Pell City / 803 Martin St S",
            "stage": "LOI",
            "priority": "high",
            "contacts": ["David Cooke (Cooke Commercial)", "Lauri Fowler (ProStar)"],
            "timeline": [],
        }
        email = {
            "subject": "Completed: Complete with Docusign",
            "snippet": "Compassus lease package is complete with Docusign.",
            "from": "David Cooke <david@example.com>",
            "date": "2026-08-04T12:00:00",
        }

        updated = matcher.match_and_update(self.make_data(deal), [email])
        updated_deal = updated["pipelineDeals"][0]

        self.assertEqual(len(updated_deal["timeline"]), 1)
        self.assertEqual(updated_deal["stage"], "Lease Signed")
        self.assertEqual(updated_deal["stageOverride"], "Lease Signed")

    def test_stale_contacts_requires_email_evidence_and_emits_one_alert_per_deal(self):
        no_history = {
            "id": "no-history",
            "name": "No History",
            "property": "Test Plaza",
            "priority": "high",
            "contacts": ["First Person", "Second Person"],
            "timeline": [],
        }
        stale = {
            "id": "stale",
            "name": "Stale Tenant",
            "property": "Test Plaza",
            "priority": "high",
            "contacts": ["Jacob Delk (Anchor)", "External Person", "Another Person"],
            "timeline": [{"date": "2020-01-01", "event": "Old email", "type": "email"}],
        }

        alerts = matcher.compute_stale_contacts(self.make_data(no_history, stale))

        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["name"], "External Person")
        self.assertEqual(alerts[0]["deal"], "Stale Tenant — Test Plaza")


if __name__ == "__main__":
    unittest.main()
