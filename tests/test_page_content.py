"""Static checks for public links and wording that must match their targets."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = (ROOT / "index.html").read_text()
INCLUDES = {path.name: path.read_text() for path in (ROOT / "_includes").glob("*.html")}
POSTS = {path.name: path.read_text() for path in (ROOT / "_posts").glob("*.md")}

ERROR_REFERENCE = "https://docs.taxid.co.ke"
# Backend: README "Hosted sandbox" host + springdoc default UI path permitted by SecurityConfig.
API_REFERENCE = "https://api.taxid.co.ke/swagger-ui/index.html"
PYPI = "https://pypi.org/project/taxid-etims/"
SDK_GITHUB = "https://github.com/Linkd-TaxID/kra-etims-sdk"


def links(page, href):
    return [re.sub(r"<[^>]+>", "", text).strip()
            for text in re.findall(r'<a[^>]*href="' + re.escape(href) + r'"[^>]*>(.*?)</a>', page, re.S)]


class LinkTests(unittest.TestCase):
    def test_error_reference_links_say_what_they_open(self):
        for name, page in {"index.html": PAGE, **INCLUDES}.items():
            for label in links(page, ERROR_REFERENCE):
                self.assertRegex(label.lower(), r"error[- ]code", name + ": " + label)
        self.assertTrue(links(PAGE, ERROR_REFERENCE))

    def test_api_reference_and_sdk_links_exist(self):
        for href in (API_REFERENCE, PYPI, SDK_GITHUB):
            self.assertTrue(links(PAGE, href), href)

    def test_blog_points_lookup_to_the_api_reference(self):
        for name, post in POSTS.items():
            for line in post.splitlines():
                if re.search(r"lookup endpoint", line, re.I):
                    self.assertNotIn(ERROR_REFERENCE + ")", line, name)
                    self.assertIn(API_REFERENCE, line, name)


class WordingTests(unittest.TestCase):
    def test_og_card_source_is_not_indexed(self):
        og = (ROOT / "og.html").read_text()
        self.assertRegex(og, r'<meta name="robots" content="noindex[^"]*"\s*/?>')

    def test_demo_footnote_agrees_with_the_faq_about_signed(self):
        faq = "SIGNED records the control-unit signing outcome; it does not establish central KRA acceptance."
        self.assertIn(faq, PAGE)
        footnote = re.search(r'<div id="connected-receipts"></div>\s*<p class="demo-note">(.*?)</p>', PAGE, re.S).group(1)
        self.assertNotIn("does not establish control-unit signing", footnote)
        self.assertIn("records the control-unit signing outcome", footnote)


class PrivacyNoticeTests(unittest.TestCase):
    NOTICE = ("We use these details only to reply about developer access. Your request is sent through "
              "FormSubmit (formsubmit.co), a third-party form service, which emails it to TaxID. Don't include "
              "API keys, KRA PINs, passwords or customer data. To have your request deleted, email "
              "support@taxid.co.ke. No spam, and no sales call unless you ask for one.")

    def test_access_form_shows_the_approved_privacy_notice(self):
        fine = re.search(r'<p class="form-fine">(.*?)</p>', PAGE, re.S).group(1)
        text = " ".join(re.sub(r"<[^>]+>", " ", fine).replace("&#39;", "'").replace("&rsquo;", "'").split())
        self.assertEqual(self.NOTICE, text)


if __name__ == "__main__":
    unittest.main()
