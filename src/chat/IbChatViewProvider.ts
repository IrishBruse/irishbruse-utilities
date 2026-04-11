import {
    CancellationToken,
    commands,
    ExtensionContext,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    window,
} from "vscode";
import { Commands, Views } from "../constants";
import { buildIbChatHtml } from "./ibChatHtml";
import { openNewIbChatEditor } from "./ibChatEditor";
import { registerCommandIB } from "../utils/vscode";

/**
 * Registers the IB Chat docked webview, editor webview instances, and related commands.
 */
export function activateIbChatView(context: ExtensionContext): void {
    const provider = new IbChatViewProvider();
    context.subscriptions.push(
        window.registerWebviewViewProvider(Views.IbChatView, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );
    registerCommandIB(
        Commands.ShowIbChat,
        () => commands.executeCommand(`${Views.IbChatView}.focus`),
        context
    );
    registerCommandIB(Commands.NewIbChatEditor, () => openNewIbChatEditor(context), context);
}

class IbChatViewProvider implements WebviewViewProvider {
    /**
     * Builds the themed HTML shell for the docked chat view.
     */
    resolveWebviewView(
        webviewView: WebviewView,
        resolveContext: WebviewViewResolveContext,
        token: CancellationToken
    ): void | Thenable<void> {
        if (token.isCancellationRequested) {
            return;
        }
        const { webview } = webviewView;
        webview.options = { enableScripts: false };
        const sessionHint = resolveContext.state !== undefined ? "restored" : "new";
        webview.html = buildIbChatHtml(webview.cspSource, sessionHint);
    }
}
