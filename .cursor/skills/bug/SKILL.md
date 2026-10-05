---
name: bug
description: Write one bug ticket from the image or text supplied with /bug.
disable-model-invocation: true
---

# Bug

`/bug` writes one markdown ticket in `.tickets/bugs/` from the image or text in this message.

## Source

- **Text:** the words supplied with the command.
- **Image:** each attached image. Read it and record visible errors, UI state, and on-screen text.

Use only that source. When a field is absent, write `Not in the source`.

**Done when:** every ticket field is filled from the source or marked `Not in the source`.

## File

Write `.tickets/bugs/<slug>.md`.

`<slug>` is the title in lowercase words joined by hyphens. If that file exists, append `-2`, then `-3`, until the name is free.

Copy each supplied image beside the ticket as `<slug>-1.<ext>`, `<slug>-2.<ext>`, in attachment order. Keep the original extension. Link each copy in the ticket. When no image is supplied, omit the Images section.

```markdown
---
type: bug
title: <defect in one line>
created: <YYYY-MM-DD>
source: <text | image | both>
---

# <same title>

## Description
<What is wrong, in the source's terms.>

## Steps
1. <Only steps the source states or the image shows>

## Expected
<Stated expectation, or "Not in the source">

## Actual
<What the source shows or says happened>

## Evidence
- <Quoted text or a visible detail from the image>

## Images
- ![](./<slug>-1.<ext>)
```

**Done when:** the ticket is written, each supplied image is copied beside it, and the reply lists those paths.
