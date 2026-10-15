# Bundled fonts

These existing WOFF2 files were introduced by landing commit
`79e5e0aa2aa520a853c83209bf62c074c20f1f9e` to self-host fonts previously loaded
from Google Fonts. They are used by `brand.css` and the landing page. This
inventory adds the upstream SIL Open Font License notices without changing
either font.

| File | SHA-256 | Embedded family / OpenType fontRevision |
| --- | --- | --- |
| inter-var.woff2 | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` | Inter / 262210 (16.16 fixed point) |
| jetbrains-mono-var.woff2 | `83c005d49d8a6a50474c73a5a36ac0468076e9c4a29da7bdb14995d80560a5be` | JetBrains Mono / 144900 (16.16 fixed point) |

The original subset download URLs and build recipe were not recorded. The
embedded versions and hashes above identify the files actually shipped; they
do not assert byte identity with an upstream release archive.

- Inter upstream: <https://github.com/rsms/inter>. `OFL-Inter.txt` is copied from
  `LICENSE.txt` at upstream v4.0, commit
  `2ce9119398be143fa289c3e180824db1b7ed803e`.
- JetBrains Mono upstream: <https://github.com/JetBrains/JetBrainsMono>.
  `OFL-JetBrainsMono.txt` is copied from `OFL.txt` at upstream v2.304, commit
  `cd5227bd1f61dff3bbd6c814ceaf7ffd95e947d9`.

Keep both copyright/license notices with copies of these fonts, including
embedded copies in other TaxID projects. Review upstream provenance and record
the exact source/build when replacing a font.
