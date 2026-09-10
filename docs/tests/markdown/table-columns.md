# Table column wrap

Open this file with **Reopen Editor With... → Markdown Editor (ib-utilities)**.

Short columns stay wide enough for one word. Long columns wrap first when the table is wider than the editor.

Related files: [showcase.md](./showcase.md), [edge-cases.md](./edge-cases.md).

## Short words plus a long notes column

`Name`, `Role`, and `On` stay on one line. `Notes` wraps.

| Name | Role | On | Notes |
| :--- | :--- | :-: | :--- |
| Ada | Engineer | Yes | Long description that should wrap instead of stretching the column forever or forcing Role onto two lines |
| Grace | Architect | No | Another long cell that takes leftover width so short status words do not break |
| Alan | Researcher | Yes | Empty next → |
| | | | |

## Many short columns

Each short cell is a single word. None of these words wrap. Only `Description` wraps.

| Id | Kind | State | Owner | Description |
| --: | :--- | :--- | :--- | :--- |
| 1 | Bug | Open | Ada | Reproduce the wrap: shrink the editor until Description wraps; Id Kind State Owner stay one word per line |
| 12 | Task | Done | Grace | Second row with the same short labels and more description text that continues wrapping in this column |
| 123 | Epic | Hold | Alan | Third row so column min width uses the longest short word such as Researcher-length names if you edit Owner |

## Header wider than body

The header word `Alignment` is longer than `left`. That header stays on one line. `Detail` wraps.

| Alignment | Detail |
| :--- | :--- |
| left | Extra detail text that wraps while the Alignment header and the word left stay on one line |
| center | More wrapping text in the wide column |
| right | Last wrapping row |

## Compact numeric columns

Numbers and units stay on one line. `Comment` wraps.

| Step | ms | Pass | Comment |
| --: | --: | :-: | :--- |
| 1 | 16 | Yes | Frame budget comment that wraps in this column only |
| 2 | 32 | Yes | Another comment with enough words to wrap when the editor is narrow |
| 3 | 48 | No | Fail path comment; Pass stays Yes or No on one line |
