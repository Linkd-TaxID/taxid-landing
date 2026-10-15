# Repository content and publication policy

The Linkd-TaxID maintainers own this policy and its exceptions. Changes to the
policy, repository checks, workflows, or publication inputs require maintainer
review. GitHub branch and environment rules must require the checks; local
ignore patterns are convenience, not enforcement.

This repository contains the public taxid.co.ke site, its reviewed source
assets, and the separately deployed Cloudflare Worker. Keep portable project
documentation, dependency manifests/locks, synthetic examples, and tests here.
The font binaries and upstream notices in `fonts/` are deliberate source assets.
`og.html` is the source of the social image. These assets are retained even
though they are generated or binary.

Keep workstation agent prompts, local tool configuration, handoff/verification
reports, ad hoc audit outputs, build archives, dependency directories, real
credentials, taxpayer identifiers, and raw fiscal captures outside Git. Store
necessary operational evidence in access-controlled storage. Use clearly
synthetic examples in public documentation; public identifiers and secret
binding names are allowed, secret values are not. Secret scanning does not
classify all personal or fiscal data: reviewers must check examples and posts.

`worker/.dev.vars.example` is a synthetic configuration template. Actual Worker
secrets belong in Cloudflare secret bindings or an ignored local `.dev.vars`.
The Worker is never part of the Pages artifact.

The Pages workflow builds on pull requests and main, runs the repository and
site checks, and uploads only verified `_site` output. Deployment runs only
from main after those checks and the Worker compile check pass. Protect the
`github-pages` environment to admit main only. Configure Pages to use GitHub
Actions after merging this workflow; branch publishing bypasses this gate.

`scripts/check_site.py` permits the site's explicit root assets, blog pages,
static assets, and font notices. Update that inventory deliberately when adding
a new public output. Governance documents, tests, scripts, and Worker source
remain in source control and are excluded from the site. A new exception needs
its purpose, owner, publication scope, and validation recorded in the reviewing
PR. Do not waive checks merely because a repository is private.

Removing a file from main does not remove earlier commits, branches, release
artifacts, cached pages, or forks. Classify any actual exposure before deciding
on branch retirement, credential revocation, or coordinated history cleanup.
