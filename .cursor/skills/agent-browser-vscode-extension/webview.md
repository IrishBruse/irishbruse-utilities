# Workbench vs webview

Custom editors and previews run in a `vscode-webview://` iframe. The workbench accessibility tree usually shows one `Iframe` ref. The inner document is a different origin.

## Scroll and focus

1. Snapshot the workbench, click the `Iframe` ref.
2. `press PageDown` / `press Home` / `press End` to scroll the webview.
3. Mouse wheel on the workbench often scrolls the wrong pane.

`snapshot --frame @eN` may still return the workbench. Treat that as "inner tree unavailable" and drive by iframe focus + keys, not by guessing inner `@eN`.

## eval

`eval` in the workbench cannot read `iframe.contentDocument` for `vscode-webview://`. Do not use eval to click lock pills or mermaid **Open Preview**.

## Title bar vs webview chrome

Editor title-bar actions are workbench buttons (snapshot them). Lock pills, language badges, **Open Preview**, and table cells live inside the iframe (screenshot to verify).
