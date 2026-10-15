import importlib.util
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "check_site", Path(__file__).resolve().parents[1] / "scripts/check_site.py"
)
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)


class SitePublicationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in site.REQUIRED_FILES:
            self.write(name, "public content")

    def write(self, name, content):
        file = self.root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(content)
        return file

    def test_site_and_public_font_notices_are_allowed(self):
        self.write("blog/a-new-post/index.html", "public post")
        self.write("fonts/OFL-Inter.txt", "upstream license")
        self.assertEqual([], site.check_site(self.root))

    def test_unexpected_outputs_are_rejected(self):
        for name in (
            "worker/src/index.js", "CLAUDE.md", "PHASE5_VERIFICATION.md",
            "docs/raw-evidence.json", "scripts/check_site.py", ".env",
            "assets/.dev.vars", "REPOSITORY_POLICY.md",
        ):
            with self.subTest(name=name):
                file = self.write(name, "private content")
                self.assertTrue(any(name in error for error in site.check_site(self.root)))
                file.unlink()

    def test_symlink_and_missing_site_are_rejected(self):
        (self.root / "assets/leak.css").symlink_to(self.root / "index.html")
        self.assertTrue(any("symbolic" in error for error in site.check_site(self.root)))
        self.assertTrue(site.check_site(self.root / "does-not-exist"))

    def test_missing_brand_input_is_rejected(self):
        (self.root / "fonts/inter-var.woff2").unlink()
        self.assertTrue(any("required" in error for error in site.check_site(self.root)))


if __name__ == "__main__":
    unittest.main()
