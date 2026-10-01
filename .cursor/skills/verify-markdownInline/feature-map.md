# Feature map

## Rendered document

Does: Show the fixture as formatted inline markdown with YAML front matter above the body.
Reach: none
Activate: offset=49
From: entry

## YAML front matter

Does: Paint the opening `---` block as YAML with a Properties switch on the fence.
Reach: none
Activate: offset=49
From: Rendered document

## Skill properties

Does: Open the typed PROPERTIES card for front matter fields and hide the raw YAML block.
Reach: none
Activate: text="Properties"
From: Rendered document

## Heading

Does: Reveal the raw `#` marker when the title is activated or included in a drag selection.
Reach: none
Activate: offset=42
From: Rendered document

## Bold

Does: Reveal the raw strong markers when the bold word is activated.
Reach: none
Activate: offset=67
From: Rendered document

## Italic

Does: Reveal the raw emphasis markers when the italic word is activated.
Reach: none
Activate: offset=77
From: Rendered document

## Strikethrough

Does: Reveal the raw strike markers when the struck word is activated.
Reach: none
Activate: offset=87
From: Rendered document

## Inline code

Does: Reveal the raw backticks when the inline code span is activated.
Reach: none
Activate: offset=103
From: Rendered document

## Link

Does: Reveal the raw link markdown when the link label is activated.
Reach: none
Activate: offset=119
From: Rendered document

## Blockquote

Does: Reveal the raw `>` marker when the quote line is activated.
Reach: none
Activate: offset=157
From: Rendered document

## Thematic break

Does: Reveal the raw `---` rule when the horizontal rule line is activated.
Reach: none
Activate: offset=171
From: Rendered document

## Image

Does: Reveal the raw image markdown when the picture is activated or the caret is on the image line or the line before it.
Reach: none
Activate: alt="Dot"
From: Rendered document

## Missing image

Does: Show a fallback label when the image file is absent, and reveal the raw markdown when that label is activated.
Reach: none
Activate: text="Missing"
From: Rendered document

## Task

Does: Show a task checkbox with no list bullet, and toggle it between open and done.
Reach: none
Activate: .inline-md-task
From: Rendered document

## Code block

Does: Reveal the fenced code source when the code text is activated.
Reach: none
Activate: offset=242
From: Rendered document

## Table

Does: Reveal the raw pipe source when the table is activated or the caret is on the table or the line before it.
Reach: none
Activate: .inline-md-table
From: Rendered document

## Mermaid

Does: Render idle mermaid fences as SVG diagrams with a green underlined **Open Preview** on each block, and paint the diagram again after leaving raw source.
Reach: none
Activate: .inline-md-mermaid-open-preview
From: Rendered document
Sequence: yes
