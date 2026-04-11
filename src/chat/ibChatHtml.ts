/**
 * Returns themed chat shell HTML for a webview using the given CSP source token.
 */
export function buildIbChatHtml(cspSource: string, sessionHint: string): string {
    const contentSecurityPolicy = [`default-src 'none'`, `style-src ${cspSource} 'unsafe-inline'`].join("; ");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      height: 100vh;
      display: flex;
      flex-direction: column;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.5;
    }
    .root {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 8px;
      gap: 8px;
    }
    .messages {
      flex: 1;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 4px;
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      background-color: var(--vscode-editor-background);
    }
    .bubble {
      max-width: 90%;
      padding: 8px 10px;
      border-radius: 6px;
    }
    .bubble.assistant {
      align-self: flex-start;
      background-color: var(--vscode-textBlockQuote-background);
      border: 1px solid var(--vscode-textBlockQuote-border);
    }
    .bubble.user {
      align-self: flex-end;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
    }
    .label {
      font-size: 0.85em;
      opacity: 0.85;
      margin-bottom: 4px;
    }
    .composer {
      display: flex;
      flex-direction: row;
      gap: 8px;
      align-items: flex-end;
    }
    textarea {
      flex: 1;
      min-height: 64px;
      resize: none;
      padding: 8px;
      color: var(--vscode-input-foreground);
      background-color: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
    }
    textarea:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    button {
      padding: 8px 14px;
      color: var(--vscode-button-foreground);
      background-color: var(--vscode-button-background);
      border: none;
      border-radius: 4px;
      font-family: inherit;
      font-size: inherit;
      cursor: default;
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
  </style>
</head>
<body>
  <!-- ${sessionHint} -->
  <div class="root">
    <div class="messages" role="log" aria-label="Messages">
      <div class="bubble assistant">
        <div class="label">Assistant</div>
        <div>This is a placeholder message. Chat will connect here later.</div>
      </div>
      <div class="bubble user">
        <div class="label">You</div>
        <div>Example user message.</div>
      </div>
    </div>
    <div class="composer">
      <textarea placeholder="Type a message..." aria-label="Message input"></textarea>
      <button type="button">Send</button>
    </div>
  </div>
</body>
</html>`;
}
