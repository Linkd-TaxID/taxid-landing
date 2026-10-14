# taxid-landing

Source for [taxid.co.ke](https://taxid.co.ke), served by GitHub Pages.

- `index.html`: the landing page. It has no front matter, so Jekyll copies it through unchanged.
- `blog/`, `_posts/`, `_layouts/`, `_includes/`, `assets/blog.css`: the blog at `/blog/`.
- `worker/`: optional Cloudflare Worker, deployed separately and excluded from the site build.

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

## Previewing locally

```bash
bundle install
bundle exec jekyll serve
```

Then open http://localhost:4000/blog/.

## Styling

The blog loads `brand.css` (tokens and fonts) and `assets/blog.css`. The top of `blog.css` is a verbatim copy of the base, nav, button and footer rules from `index.html`. If you change those in `index.html`, mirror the change there.
