# Feature map

## Rendered document

Does: Show the fixture as formatted inline markdown.
Reach: none
Activate: role=textbox
From: entry

## Heading

Does: Reveal the raw heading marker when the title is activated.
Reach: none
Activate: text="Hello"
From: Rendered document

## Bold

Does: Reveal the raw strong markers when the bold word is activated.
Reach: none
Activate: text="bold"
From: Rendered document

## Image

Does: Reveal the raw image markdown when the picture is activated.
Reach: none
Activate: alt="Dot"
From: Rendered document

## Missing image

Does: Show a fallback label when the image file is absent, and reveal the raw markdown when that label is activated.
Reach: none
Activate: text="Missing"
From: Rendered document

## Task

Does: Toggle the task checkbox between open and done.
Reach: none
Activate: .inline-md-task
From: Rendered document

## Code block

Does: Reveal the fenced code source when the code text is activated.
Reach: none
Activate: text="const value = 1;"
From: Rendered document
