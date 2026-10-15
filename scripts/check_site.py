#!/usr/bin/env python3
"""Validate the actual Jekyll output before uploading it to Pages."""

import argparse
from pathlib import Path


ROOT_FILES = {
    "index.html", "og.html", "og-image.png", "brand.css", "CNAME", "robots.txt",
    "apple-touch-icon.png", "favicon.ico", "favicon-32x32.png", "sitemap.xml",
}
FONT_FILES = {
    "inter-var.woff2", "jetbrains-mono-var.woff2", "OFL-Inter.txt",
    "OFL-JetBrainsMono.txt",
}
REQUIRED_FILES = {
    "index.html", "blog/index.html", "brand.css", "assets/blog.css", "CNAME",
    "fonts/inter-var.woff2", "fonts/jetbrains-mono-var.woff2",
    "fonts/OFL-Inter.txt", "fonts/OFL-JetBrainsMono.txt", "sitemap.xml",
    "blog/feed.xml",
}


def allowed_file(path):
    parts = path.parts
    if len(parts) == 1:
        return path.name in ROOT_FILES
    if parts[0] == "fonts":
        return len(parts) == 2 and path.name in FONT_FILES
    if parts[0] == "assets":
        return path.suffix.lower() in {".css", ".js", ".svg", ".png", ".jpg", ".webp"}
    if parts[0] == "blog":
        return path.as_posix() == "blog/feed.xml" or path.name == "index.html"
    return False


def check_site(directory):
    if not directory.is_dir():
        return ["site output directory does not exist"]
    errors = []
    present = set()
    for file in sorted(directory.rglob("*")):
        relative = file.relative_to(directory)
        name = relative.as_posix()
        if file.is_symlink():
            errors.append(f"{name}: symbolic links are not publishable")
            continue
        if not file.is_file():
            continue
        present.add(name)
        if any(part.startswith(".") for part in relative.parts) or not allowed_file(relative):
            errors.append(f"{name}: outside the public site inventory")
    for missing in sorted(REQUIRED_FILES - present):
        errors.append(f"{missing}: required site output missing")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", nargs="?", type=Path, default=Path("_site"))
    args = parser.parse_args()
    errors = check_site(args.directory)
    if errors:
        for error in errors:
            print(error)
        return 1
    print("Site inventory check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
