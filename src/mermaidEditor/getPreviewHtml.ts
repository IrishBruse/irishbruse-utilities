import { ExtensionContext, Uri, Webview } from "vscode";

export function getNonce(): string {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getPreviewHtml(webview: Webview, context: ExtensionContext, nonce: string): string {
    const mediaUri = Uri.joinPath(context.extensionUri, "media", "mermaidPreview");
    const styleUri = webview.asWebviewUri(Uri.joinPath(mediaUri, "preview.css"));
    const mermaidUri = webview.asWebviewUri(Uri.joinPath(mediaUri, "mermaid.min.js"));
    const themeUri = webview.asWebviewUri(Uri.joinPath(mediaUri, "vsCodeTheme.js"));
    const scriptUri = webview.asWebviewUri(Uri.joinPath(mediaUri, "preview.js"));
    const cspSource = webview.cspSource;

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data: blob:;" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Mermaid Preview</title>
</head>
<body>
    <div id="toolbar" role="toolbar" aria-label="Diagram controls">
        <div class="toolbar-group">
            <button type="button" id="zoom-out" title="Zoom out" aria-label="Zoom out">-</button>
            <button type="button" id="zoom-fit" title="Fit to view" aria-label="Fit to view">Fit</button>
            <button type="button" id="zoom-in" title="Zoom in" aria-label="Zoom in">+</button>
        </div>
        <div class="toolbar-separator" aria-hidden="true"></div>
        <button type="button" id="copy-png" title="Copy PNG" aria-label="Copy PNG" disabled>
            <svg class="toolbar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true">
                <path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
                <path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
            </svg>
        </button>
    </div>
    <div id="viewport">
        <div id="canvas">
            <div id="diagram" class="mermaid"></div>
        </div>
    </div>
    <div id="error" hidden></div>
    <script nonce="${nonce}" src="${mermaidUri}"></script>
    <script nonce="${nonce}" src="${themeUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
