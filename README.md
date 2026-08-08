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

## Publishing to the Workspace Marketplace

Needed only to distribute this beyond your own account. No manifest changes are required — the Apps Script
manifest has no Editor-add-on-specific properties, so the `appsscript.json` in this repo is already what you
publish. (The `addOns` block with `homepageTrigger` belongs to *Google Workspace add-ons*, the card-based
kind. This is a classic Editor add-on: `onOpen` plus a menu.)

**Prerequisite: the script project must be standalone.** An Editor add-on cannot be published from a
container-bound script, so the copy-paste install in Option A is for personal use only. Use Option B.

1. **Standard Cloud project.** Apps Script's auto-generated project can't be used for publication. Create one
   at [console.cloud.google.com](https://console.cloud.google.com/projectcreate), then in the Apps Script
   editor go to **Project Settings → Google Cloud Platform (GCP) Project → Change project** and paste the
   project number.
2. **OAuth consent screen.** Configure it in the Cloud console. The two scopes here (`documents.currentonly`,
   `script.container.ui`) are narrow and non-sensitive, which keeps verification simple.
3. **Create a version.** In the Apps Script editor: **Deploy → Manage deployments**, create a version, and
   note the version number — Editor add-ons are published by version number, not deployment ID.
4. **Enable the Google Workspace Marketplace SDK** on the Cloud project and fill in the app configuration,
   pointing it at the script ID and version from step 3.
5. **Store listing.** Icons must be square, in colour, with transparent backgrounds; screenshots must be
   legible and actually show the add-on. Every link in the listing has to resolve.
6. **Choose visibility and submit.** Private (your Workspace domain only) publishes immediately with no
   Google review. Public goes through Marketplace review, typically several days.

**Visibility cannot be changed after you save it**, so decide private vs. public before submitting.

References: [publish an Editor add-on](https://developers.google.com/workspace/add-ons/how-tos/publish-add-on-overview)
· [how to publish](https://developers.google.com/workspace/marketplace/how-to-publish)
· [app review](https://developers.google.com/workspace/marketplace/about-app-review)

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
