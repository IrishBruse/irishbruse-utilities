# Lists and task checkboxes

Open with **Markdown Editor (ib-utilities)**. Related: [keyboard-whitespace.md](./keyboard-whitespace.md), [showcase.md](./showcase.md).

## List marker color

List bullets and numbers must **not** use the H2 heading color. Compare with the heading below.

## Heading 2 for color reference

- Bullet A
- Bullet B
  - Nested bullet
  - Another nested
1. Ordered one
2. Ordered two
   1. Nested ordered

## Task checkboxes (toggle on click)

Click each box. `[ ]` and `[x]` must stay on **one line** (no line break between `[` and `]`).

- [ ] Unchecked — click to check
- [x] Checked — click to uncheck
- [ ] Parent task
  - [x] Done child
  - [ ] Open child
- [ ] Mixed with **bold** and `code` in the same line

## Task list inside a quote

> - [ ] Quote task unchecked
> - [x] Quote task checked

## Enter continues tasks

Place the caret at the end of "New item" below, press Enter, and confirm a new `- [ ]` line appears.

- [ ] New item

## Ordered list + tasks (GFM)

1. [ ] Step one
2. [x] Step two done
3. [ ] Step three

**Note:** Some parsers treat `1. [ ]` as ordered task syntax; confirm rendering and toggle still work.

## Loose vs tight lists

Tight list (no blank lines between items):

- One
- Two
- Three

Loose list (blank line between items):

- Alpha

- Beta

- Gamma
