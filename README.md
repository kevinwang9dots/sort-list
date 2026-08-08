# Sort Bullets

A Google Docs add-on that alphabetically sorts the bullet-point list you have highlighted.

Highlight this:

```
• carrot
• apple
• avocado
• banana
```

Run **Sort selected list A → Z** and you get:

```
• apple
• avocado
• banana
• carrot
```

Sub-bullets ride along with their parent bullet and are never reordered among themselves:

```
• carrot                • apple
    ◦ orange                ◦ zebra
    ◦ apple        →        ◦ alpha
• apple                 • carrot
    ◦ zebra                 ◦ orange
    ◦ alpha                 ◦ apple
```

## Install

### Option A — one document (fastest, personal use)

1. Open the Google Doc you want to sort lists in.
2. **Extensions → Apps Script**.
3. Delete the placeholder `myFunction` and paste in the contents of [`Code.gs`](Code.gs).
4. Click the project name at the top and rename it to `Sort Bullets` — this name becomes the menu label.
5. Save (⌘S), then reload the Google Doc.
6. The commands appear under **Extensions → Sort Bullets**. The first run asks for authorisation; approve it.

### Option B — clasp, standalone project (required for publishing)

```bash
npm install -g @google/clasp
clasp login
clasp create --type standalone --title "Sort Bullets"   # run inside this folder
clasp push
```

Use `--type standalone`, not `--type docs` — the latter creates a *new document* with a bound script, and
Editor add-ons cannot be published from a bound script.

`clasp create` writes a `.clasp.json` (git-ignored) and its own `appsscript.json` — keep the one in this repo,
it already sets the V8 runtime and the two scopes the add-on needs.

To use it across your own documents before publishing anything: **Deploy → Test deployments → Install** in the
Apps Script editor. The add-on then appears under **Extensions** in every doc on your account.

## Use

1. Highlight the bullets you want sorted. A partial highlight is fine — touching any part of a line selects
   that whole bullet.
2. **Extensions → Sort Bullets → Sort selected list A → Z** (or **Z → A**).

Details worth knowing:

- Sorting is **case-insensitive** (`Apple` sorts next to `apple`) and **number-aware** (`item 2` comes before
  `item 10`).
- Only the shallowest level in your highlight is sorted. Highlight the top-level bullets to sort those;
  highlight just a set of sub-bullets to sort only those.
- If your highlight *starts* partway into a sub-bullet group, those leading sub-bullets belong to a parent you
  did not select, so they stay pinned at the top rather than being sorted as if they were top-level.
- Bold, italics, links, and numbered-list numbering survive the sort; numbering does not restart.
- Works in the document body, table cells, headers, and footers.

## Limitations

- Operates on real Google Docs list items. Lines you typed as plain paragraphs starting with `-` are not
  bullets and are left alone.
- The highlight has to be one unbroken run of bullets. A blank line or paragraph in the middle stops the sort
  with an explanation rather than shuffling items across two separate lists.

## Publishing privately to 9dots.org

This add-on is published **private to the 9dots.org Workspace domain**: only people in the organisation can
find or install it, and it goes live immediately with no Google review.

No manifest changes are needed. The Apps Script manifest has no Editor-add-on-specific properties, so the
`appsscript.json` in this repo is already what gets published. (An `addOns` block with `homepageTrigger` would
belong to a *Google Workspace add-on*, the card-based kind — this is a classic Editor add-on: `onOpen` plus a
menu.)

**Two things decide whether this works, and both are set early:**

- **The script project must be standalone.** Editor add-ons cannot be published from a container-bound script,
  so the copy-paste install in Option A is personal-use only. Use Option B.
- **The Cloud project must belong to the 9dots.org organisation.** "Private" means visible to the Workspace
  domain that owns the Cloud project. Create it under a 9dots.org account, not a personal one, or the listing
  will target the wrong domain.

### Steps

1. **Create the standalone script** — from this repo:
   ```bash
   npm install -g @google/clasp
   clasp login
   clasp create --type standalone --title "Sort Bullets"
   clasp push
   ```
   Sign in as your 9dots.org account. Note the script ID that `clasp create` prints.
2. **Create a standard Cloud project** under the 9dots.org org at
   [console.cloud.google.com](https://console.cloud.google.com/projectcreate). Apps Script's auto-generated
   project cannot be used for publication. Then in the Apps Script editor: **Project Settings → Google Cloud
   Platform (GCP) Project → Change project**, and paste the project number.
3. **OAuth consent screen** — set **User Type: Internal**. Internal apps skip OAuth verification entirely,
   which is the main reason the private path is fast. The two scopes here
   (`documents.currentonly`, `script.container.ui`) are narrow and non-sensitive; keep them that way.
4. **Create a version** — **Deploy → Manage deployments** in the Apps Script editor. Note the version number.
   Editor add-ons publish by *version number*, not deployment ID.
5. **Enable the Google Workspace Marketplace SDK** on the Cloud project, then fill in App Configuration:
   point it at the script ID from step 1 and the version from step 4.
6. **Store listing** — still required for private apps. Square colour icons with transparent backgrounds, a
   legible screenshot, and links that resolve.
7. **Set visibility to Private and submit.** It is live for the domain right away.

**Visibility cannot be changed after you save it.** A private listing cannot later be flipped to public — that
would mean a new listing.

Domain-wide installation may need a Workspace admin to allowlist the app even though it is private, so check
with whoever runs the 9dots tenant before promising it to people.

References: [publish an Editor add-on](https://developers.google.com/workspace/add-ons/how-tos/publish-add-on-overview)
· [how to publish](https://developers.google.com/workspace/marketplace/how-to-publish)

## Tests

`test/local-test.js` runs `Code.gs` against a stubbed `DocumentApp`, so the grouping, comparison, and rewrite
logic can be checked without opening a document. No dependencies:

```bash
node test/local-test.js
```

It covers flat and nested sorting, partial highlights, sub-bullet-only selections, pinned orphan sub-bullets,
case-insensitive and numeric ordering, table cells, idempotency, and every error path.

## Manual test checklist

The stub cannot model rich text or Docs' own numbering, so also verify these against a scratch document:

| # | Case | Expected |
| --- | --- | --- |
| 1 | Flat list `carrot, apple, avocado, banana`, all highlighted | `apple, avocado, banana, carrot` |
| 2 | Nested list | Each sub-bullet stays under its own parent; sub-bullet order unchanged |
| 3 | One bullet bold, another a hyperlink, another a different colour | Formatting survives the sort |
| 4 | Numbered list | Numbering stays `1. 2. 3.` and does not restart partway |
| 5 | Multi-level list with different glyphs per level (`•`, `◦`, `▪`) | Glyphs stay correct at every level |
| 6 | Drag-highlight from mid-word of the first bullet to mid-word of the last | The whole bullets sort |
| 7 | List inside a table cell, and one in a header | Sorts normally |
| 8 | Nothing highlighted / highlight spanning a paragraph between two lists | Clear dialog, document unchanged |
| 9 | **Undo** (⌘Z) right after a sort | Restores the original order |
