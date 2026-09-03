# Edge cases

Use this file after [showcase.md](./showcase.md) for odd syntax, wrap, and sanitizer edges.

## Sparse headings

#

##

### Only heading then EOF nearby

## Long wrap

This line is intentionally long so wrap and horizontal overflow can be checked without a fence: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Blanks and unclosed emphasis



Paragraph after multiple blanks.

*open italic without close

**open bold without close

Talk about ``` fences ``` without opening a real block.

<!-- HTML comment should stay out of the painted preview -->

Visible after comment.

## Weird tables

| |
| - |
| |

| A | B | C |
| - | - | - |
| short | **bold** `code` [link](https://example.com) | very long cell text that stresses maxColumnWidth wrap in wrapped table style and nested cell Markdown editing |

## Tabs, Unicode, voids

-	tab-indented item
- normal item

```typescript
const π = Math.PI;
const 你好 = "hello";
```

<br>
<hr>
<img alt="1px" width="1" height="1">

## Dangerous HTML (must not run)

<object data="https://example.com"></object>
<form action="/"><input type="text"></form>
<style>body { background: red !important; }</style>
