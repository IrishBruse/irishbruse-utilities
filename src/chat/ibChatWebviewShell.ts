import { Uri, Webview } from "vscode";

const webviewMediaSegment = "media";
const webviewBundleDir = "ib-chat";
const webviewScriptName = "main.js";
const webviewStyleName = "main.css";

/**
 * HTML shell for the IB Chat editor webview: CSP, asset URIs, and root mount node.
 */
export function getIbChatWebviewHtml(extensionRoot: Uri, webview: Webview): string {
    const scriptUri = webview.asWebviewUri(
        Uri.joinPath(extensionRoot, webviewMediaSegment, webviewBundleDir, webviewScriptName)
    );
    const styleUri = webview.asWebviewUri(
        Uri.joinPath(extensionRoot, webviewMediaSegment, webviewBundleDir, webviewStyleName)
    );
    const cspSource = webview.cspSource;
    const contentSecurityPolicy = [
        `default-src 'none'`,
        `style-src ${cspSource}`,
        `font-src ${cspSource}`,
        `script-src ${cspSource}`,
    ].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="root"></div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
}
