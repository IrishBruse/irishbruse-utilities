# Keyboard and trailing whitespace

Open with **Markdown Editor (ib-utilities)**. Edit the blocks below and confirm behavior matches the **Expected** notes.

Related: [lists-tasks.md](./lists-tasks.md), [README.md](./README.md).

## Enter vs Shift+Enter

Place the caret at the end of each line below and press the key.

### Plain paragraph

First line of a paragraph.  
Second line after a hard break (two trailing spaces before this line).

**Expected:** Enter at end of "paragraph." starts a new paragraph. Shift+Enter at end of "paragraph." inserts a hard line break (you should see `··` dots before the newline in source).

### Unordered list

- Alpha
- Beta
- Gamma

**Expected:** Enter at end of "Gamma" adds `- ` for a new item. Enter on an empty list item exits the list.

### Ordered list

1. One
2. Two
3. Three

**Expected:** Enter at end of "Three" continues with `4. `.

### Block quote

> Quote line one.
> Quote line two.

**Expected:** Enter inside the quote continues with `> `.

## Trailing space dots

Only **end-of-line** spaces before a newline should render as middle dots (`·`). Spaces between words must stay invisible.

| Case | Source hint | Expected |
| :--- | :--- | :--- |
| Mid-sentence | `word word` (single space) | No dot between words |
| Hard break | two spaces before newline | Two `·` before the line break |
| Paragraph end | spaces after last word on a line | `·` only at line end, not mid-line |
| List item end | spaces after list text | `·` at end of item line only |

Editable samples (add or remove trailing spaces to test):

Line with no trailing spaces.

Line with two trailing spaces before break.  
Next line after hard break.

- List item with trailing spaces at end.   
- Second item normal.

## Caret at block end

Click at the end of this long line and type more characters: the caret should stay visible and text should append in place.

The quick brown fox jumps over the lazy dog.

## Empty areas

Click below this paragraph in the padding or empty space at the bottom of the document. The caret should appear and you can type a new block.
