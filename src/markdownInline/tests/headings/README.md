# Heading line height

A scaled heading line is tall enough for its font size.
The view line height is `headingViewLineHeightPx(paragraph height, level)`.
That uses `HEADING_SCALE[level] × HEADING_LINE_HEIGHT_MULTIPLIER` on the normal paragraph line.
Body-sized headings (`h5`, `h6`) use the default editor line height.
The line below a heading starts after the full heading row height.
