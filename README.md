# taxid-landing

Source for [taxid.co.ke](https://taxid.co.ke), served by GitHub Pages.

- `index.html`: the landing page. It has no front matter, so Jekyll copies it through unchanged.
- `blog/`, `_posts/`, `_layouts/`, `_includes/`, `assets/blog.css`: the blog at `/blog/`.
- `worker/`: optional Cloudflare Worker, deployed separately and excluded from the site build.

## Interactive examples

The creator and retail examples run entirely in the browser using synthetic
fixtures in `connected-demo.js`. They make no API requests. The controls
illustrate successful, pending and uncertain outcomes, recovery using the same
reference, duplicate recovery, a separate platform fee and a partial return.
Changing a selection clears the old result; refreshing clears all sample state.
Receipt numbers and recovery transitions are illustrations, not evidence of
control-unit signing or KRA acceptance. Use the invited workspace for connected
integration testing.

Run the example checks with `node --test tests/test_connected_demo.mjs`.

## Writing a blog post

1. Add a file to `_posts/` named `YYYY-MM-DD-short-slug.md`. The URL becomes `/blog/short-slug/`.
2. Start it with front matter:

   ```yaml
   ---
   title: "Question-style title a developer would search for"
   description: "One or two sentences. Used as the meta description and the card text."
   category: Recovery          # optional eyebrow label
   author: Jane Wanjiku        # optional, defaults to TaxID Engineering
   # last_modified_at: 2026-11-01   # set when you revise a post
   # faq:                            # optional FAQPage schema, see below
   ---
   ```

3. Open a PR. Once it merges to `main`, Pages publishes it.

Posts dated in the future are not published until that date.

## Publication checks

The Pages workflow builds every pull request and checks the resulting `_site`
inventory and content before publishing from `main`. It also compiles the
Worker with `wrangler deploy --dry-run`; the Worker is deployed separately.
Pages must use GitHub Actions as its publishing source, with the `github-pages`
environment limited to `main`.

After a local build, run:

```bash
python3 -m unittest discover -s tests -p test_site.py
python3 scripts/check_site.py _site
python3 scripts/check_repository.py --artifact-dir _site
```

See [REPOSITORY_POLICY.md](REPOSITORY_POLICY.md) for source and publication
boundaries and [fonts/README.md](fonts/README.md) for font notices/provenance.

### Writing for search and AI answers

- Open with the answer in two or three sentences, then explain.
- Use real questions as `##` headings.
- Be specific: endpoints, field names, statuses. Link to the docs.
- Only state what is true today. TaxID is not yet KRA-approved, and `SIGNED` is not central KRA acceptance. Keep wording consistent with the landing page.
- Add `last_modified_at` whenever you update a post.

### FAQ schema

Posts with a `faq:` list in front matter get FAQPage structured data:

```yaml
faq:
  - q: "Does SIGNED mean KRA has accepted the invoice?"
    a: "No. SIGNED records the control-unit signing outcome..."
```

Each question and answer must also appear word for word in the post body.

## Comments

Posts show a comment thread powered by [giscus](https://giscus.app), stored in this repo's GitHub Discussions. Readers sign in with GitHub to comment, and replies and moderation happen in the Discussions tab.

One-time setup (needs a repo admin and an org owner):

1. Settings → General → Features → enable **Discussions**.
2. Install the [giscus app](https://github.com/apps/giscus) on this repo only.
3. In Discussions, create a category named **Blog comments** with the **Announcements** format, so only giscus and maintainers can start threads.
4. On [giscus.app](https://giscus.app), enter `Linkd-TaxID/taxid-landing`, choose that category, and copy `data-repo-id` and `data-category-id` into `giscus.repo_id` and `giscus.category_id` in `_config.yml`.

Until those IDs are set, no comment section is shown. To turn comments off for one post, add `comments: false` to its front matter. The comment box uses `assets/giscus-theme.css`, a recoloured copy of giscus's dark theme in our brand colours.

## Previewing locally

```bash
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000/blog/.

## Styling

The blog loads `brand.css` (tokens and fonts) and `assets/blog.css`. The top of `blog.css` is a verbatim copy of the base, nav, button and footer rules from `index.html`. If you change those in `index.html`, mirror the change there.
