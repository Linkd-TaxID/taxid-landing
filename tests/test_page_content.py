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


if __name__ == "__main__":
    unittest.main()
