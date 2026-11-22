"""Checks the hero API samples against the backend contract and the Python SDK.

The Python sample is executed against the SDK with mocked HTTP (no network).
CI installs the released, pinned SDK (taxid-etims==0.8.1, see pages.yml) and
fails if it cannot be imported. Locally, either install that release or set
TAXID_SDK_SRC to an SDK ``src`` directory (for example
``~/Desktop/kra-etims-sdk/src``); without an importable SDK the execution tests
are skipped outside CI and the static checks still run.
"""
import contextlib
import datetime as dt
import html
import io
import json
import os
import re
import sys
import unittest
from decimal import Decimal
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
PAGE = (ROOT / "index.html").read_text()
# Backend: PurchaseService.validateInvoiceDate, etims.invoice.max-backdate-days default 7.
MAX_BACKDATE_DAYS = 7
STATUSES = ("SIGNED", "PENDING_SYNC", "OUTCOME_UNKNOWN", "RECONCILIATION_REQUIRED", "NOT_SENT", "FAILED")

if os.environ.get("TAXID_SDK_SRC"):
    sys.path.insert(0, os.path.expanduser(os.environ["TAXID_SDK_SRC"]))
try:
    import httpx
    import kra_etims
    from kra_etims.outcomes import SaleResult
except ImportError:  # pragma: no cover - depends on the local checkout
    kra_etims = None


def block(label):
    match = re.search(r'<pre[^>]*aria-label="' + re.escape(label) + r'"[^>]*>(.*?)</pre>', PAGE, re.S)
    if not match:
        raise AssertionError("missing sample: " + label)
    return html.unescape(re.sub(r"<[^>]+>", "", match.group(1)))


def python_sample():
    return block("Python complete request example")


def curl_sample():
    return block("cURL complete request example")


def response_example():
    return json.loads(block("Illustrative API response"))


def curl_body(today):
    sample = curl_sample()
    match = re.search(r"<<JSON\n(.*?)\nJSON", sample, re.S)
    if not match:
        raise AssertionError("cURL sample must write the invoice body once with a heredoc")
    return json.loads(match.group(1).replace("$(date +%F)", today.isoformat()))


def decimals(value):
    """Compare JSON numbers and numeric strings by value, not by spelling."""
    if isinstance(value, dict):
        return {key: decimals(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decimals(item) for item in value]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return Decimal(str(value)).normalize()
    if isinstance(value, str) and re.fullmatch(r"-?\d+(\.\d+)?", value):
        return Decimal(value).normalize()
    return value


class StaticSampleTests(unittest.TestCase):
    def test_samples_have_no_fixed_invoice_dates(self):
        for sample in (python_sample(), curl_sample()):
            self.assertNotRegex(sample, r"\b20\d\d-\d\d-\d\d\b")
            self.assertNotRegex(sample, r"\b20\d{12}\b")
        self.assertRegex(PAGE, r"within (the last )?7 days")

    def test_curl_sample_is_itemised(self):
        body = curl_body(dt.date.today())
        self.assertTrue(body.get("items"), "OSCU branches reject a sale without items")
        self.assertNotIn("taxBand", body)
        for item in body["items"]:
            self.assertRegex(item["itemClsCd"], r"^\d{8,10}$")

    def test_samples_branch_on_every_status(self):
        for status in STATUSES:
            self.assertIn(status, python_sample())
            self.assertIn(status, curl_sample())


class CiSdkWiringTests(unittest.TestCase):
    """CI must execute the samples against a released, pinned SDK, not skip them."""

    WORKFLOW = (ROOT / ".github" / "workflows" / "pages.yml").read_text()

    def test_ci_installs_released_pinned_sdk(self):
        self.assertRegex(self.WORKFLOW, r"pip install[^\n]*\btaxid-etims==0\.8\.1\b")

    def test_ci_refuses_to_skip_sdk_execution(self):
        if os.environ.get("CI"):
            self.assertIsNotNone(kra_etims, "CI must not skip the SDK execution tests")


@unittest.skipIf(kra_etims is None, "SDK not importable; set TAXID_SDK_SRC")
class SdkExecutionTests(unittest.TestCase):
    def run_sample(self, status, http_status=200, body=None):
        sent = []
        body = body or {"purchaseId": 152, "clientReference": "INV-2026-001", "status": status}

        def handler(request):
            sent.append(request)
            return httpx.Response(http_status, json=body)

        real_client = httpx.Client
        transport = httpx.MockTransport(handler)
        environment = {"TAXID_API_KEY": "synthetic-key", "TAXID_API_URL": "https://api.example.test"}
        output = io.StringIO()
        with mock.patch.object(httpx, "Client", lambda *a, **k: real_client(*a, transport=transport, **k)), \
                mock.patch.dict(os.environ, environment), contextlib.redirect_stdout(output):
            exec(compile(python_sample(), "python-sample", "exec"), {"__name__": "sample"})
        return sent, output.getvalue()

    def test_signed_example_passes_sdk_outcome_validation(self):
        example = response_example()
        SaleResult.model_validate(example)
        sent, output = self.run_sample("SIGNED", body=example)
        self.assertEqual(1, len(sent))
        self.assertIn(example["cuInvoiceNumber"], output)

    def test_python_request_matches_contract_and_curl_invoice(self):
        sent, _ = self.run_sample("SIGNED", body=response_example())
        request = sent[0]
        self.assertEqual("/v2/etims/sale", request.url.path)
        self.assertEqual("Bearer synthetic-key", request.headers["Authorization"])
        self.assertEqual("INV-2026-001", request.headers["Idempotency-Key"])
        payload = json.loads(request.content)
        invoice_date = dt.date.fromisoformat(payload["invoiceDate"])
        today = dt.date.today()
        self.assertLessEqual(invoice_date, today)
        self.assertGreaterEqual(invoice_date, today - dt.timedelta(days=MAX_BACKDATE_DAYS))
        self.assertTrue(payload.get("items"))
        self.assertEqual(decimals(curl_body(invoice_date)), decimals(payload))

    def test_unsigned_outcomes_are_not_resubmitted(self):
        for status in STATUSES[1:]:
            with self.subTest(status=status):
                sent, output = self.run_sample(status, 202 if status == "PENDING_SYNC" else 200)
                self.assertEqual(1, len(sent), "the sample must not resubmit")
                self.assertTrue(output.strip())


if __name__ == "__main__":
    unittest.main()
