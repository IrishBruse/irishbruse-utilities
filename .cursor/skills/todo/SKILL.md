---
name: todo
description: Write one todo ticket from the image or text supplied with /todo.
disable-model-invocation: true
---

# Todo

`/todo` writes one markdown ticket in `.tickets/todos/` from the image or text in this message.

## Source

- **Text:** the words supplied with the command.
- **Image:** each attached image. Read it and record the visible task, UI state, and on-screen text.

Use only that source. When a field is absent, write `Not in the source`.

**Done when:** every ticket field is filled from the source or marked `Not in the source`.

## File

Write `.tickets/todos/<slug>.md`.

`<slug>` is the title in lowercase words joined by hyphens. If that file exists, append `-2`, then `-3`, until the name is free.

Copy each supplied image beside the ticket as `<slug>-1.<ext>`, `<slug>-2.<ext>`, in attachment order. Keep the original extension. Link each copy in the ticket. When no image is supplied, omit the Images section.

```markdown
---
type: todo
title: <task in one line>
created: <YYYY-MM-DD>
source: <text | image | both>
---

# <same title>

## Description
<Outcome in one sentence, in the source's words.>

<The details that make the task doable without the original message: where it applies, what to change, and any constraint the source states. Quote on-screen text. Keep the source's order.>

## Done when
- <Only completion conditions the source states or the image shows>

## Images
- ![](./<slug>-1.<ext>)
```

**Done when:** the description names the outcome and includes every detail the source gives for where, what, and constraints.

**Done when:** the ticket is written, each supplied image is copied beside it, and the reply lists those paths.
