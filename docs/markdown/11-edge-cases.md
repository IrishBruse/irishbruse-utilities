# Edge cases

## Empty headings and sparse structure

#

##

### Only heading then EOF

## Very long line

This line is intentionally long so horizontal overflow and wrap behavior can be checked in the editor viewport without using a fenced code block: Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

## Trailing spaces and blank lines



Paragraph after multiple blanks.

## Unclosed emphasis

*open italic without close

**open bold without close

## Nested fences in prose mention

Talk about ``` fences ``` without opening a real block.

## HTML comment

<!-- hidden comment should not dominate the preview -->

Visible after comment.

## Weird table

| |
| - |
| |

## Tabs in list

-	tab-indented item
- normal item

## Unicode identifiers in code

```typescript
const π = Math.PI;
const 你好 = "hello";
```

## CRLF-looking content

Line one.
Line two with only a period on the next visual line when wrapped.
.
