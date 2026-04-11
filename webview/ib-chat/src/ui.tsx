import type { RefObject } from "react";
import { createRoot } from "react-dom/client";
import { IbChatApp } from "./IbChatApp";
import type { ExtensionMessageAfterInit, InitPayload } from "./chatReducer";

export type { ExtensionMessageAfterInit, InitPayload } from "./chatReducer";

export type ChatView = {
    handleMessage(message: ExtensionMessageAfterInit): void;
};

/**
 * Mounts the IB Chat UI into `root`. Returns a view handle whose `handleMessage`
 * must be called for every non-init message received from the host.
 */
export function mountChatView(
    root: HTMLElement,
    init: InitPayload,
    postSend: (body: string) => void,
    postCancel: () => void,
    postSetSessionModel: (modelId: string) => void
): ChatView {
    root.replaceChildren();
    root.className = "root agent-root";
    const extensionDispatchRef: RefObject<((message: ExtensionMessageAfterInit) => void) | null> = {
        current: null,
    };
    const reactRoot = createRoot(root);
    reactRoot.render(
        <IbChatApp
            init={init}
            postSend={postSend}
            postCancel={postCancel}
            postSetSessionModel={postSetSessionModel}
            extensionDispatchRef={extensionDispatchRef}
        />
    );
    return {
        handleMessage(message: ExtensionMessageAfterInit): void {
            extensionDispatchRef.current?.(message);
        },
    };
}
