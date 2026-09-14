# Links and autolinks

Open with **Markdown Editor (ib-utilities)**. Click links to open them. Related: [showcase.md](./showcase.md), [edge-cases.md](./edge-cases.md).

## Inline links

- [Example with title](https://example.com "Example title")
- [GitHub IrishBruse](https://github.com/IrishBruse/)
- [Relative markdown](./showcase.md)
- [Fragment in this file](#inline-links)

## Angle-bracket autolinks

These must render as clickable links (not plain text or error styling):

- <https://example.com>
- <https://example.com/path?q=1&r=2>
- <mailto:test@example.com>

## Bare URL autolinks

- https://example.com
- http://example.org/foo
- www.example.com (may or may not autolink depending on parser; note actual behavior)

## Reference-style links

Reference used twice: [first][demo] and [second][demo].

Shortcut reference: [showcase][]

[demo]: https://example.com/demo "Demo reference"
[showcase]: ./showcase.md

## Link definitions (idle styling)

The following line is a **link definition**, not body text. It should look subdued (not like a parse error):

[hidden-ref]: https://example.com/hidden "Hidden reference"

Body text after the definition. Use [hidden-ref] here if the editor resolves shortcut references.

## Links in tables

Click the link in the table cell (not the cell edit chrome):

| Label | URL |
| :--- | :--- |
| Example | [open](https://example.com) |
| Relative | [showcase](./showcase.md) |
| Autolink | <https://example.com/table> |

## Links in HTML preview block

<div>
  <p>HTML <a href="https://example.com">anchor</a> inside an idle HTML block.</p>
</div>

## Images with links

[![placeholder](data:image/svg+xml,%3Csvg%20xmlns%3D'http://www.w3.org/2000/svg'%20width%3D'64'%20height%3D'64'%3E%3Crect%20fill%3D'%230078d4'%20width%3D'64'%20height%3D'64'/%3E%3C/svg%3E)](https://example.com)

Broken image (should show alt fallback, not error chrome):

![Missing image](https://example.com/does-not-exist.png "Broken on purpose")
