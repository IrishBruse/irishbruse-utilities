# ACP Client Integration

IB Chat acts as an ACP client: it spawns ACP-compliant agents as subprocesses,
communicates via JSON-RPC 2.0 over stdio, and renders agent responses in the
existing webview UI.

## Architecture

Extension Host (middle layer):
- Translates webview "send" messages into ACP `session/prompt` calls
- Translates ACP `session/update` notifications into webview messages

Agent subprocess:
- Launched with `child_process.spawn`
- Communicates via stdin/stdout using `@agentclientprotocol/sdk`

## New Files

- `src/chat/acp/acpAgentConfig.ts` - agent configuration type
- `src/chat/acp/acpAgentProcess.ts` - process lifecycle management
- `src/chat/acp/acpSessionBridge.ts` - maps IB Chat sessions to ACP sessions

## Modified Files

- `src/chat/protocol/ibChatProtocol.ts` - new message types for streaming
- `src/chat/ibChatEditor.ts` - wire up send/cancel to ACP bridge
- `src/chat/ibChatSessionsStore.ts` - add agentId to session record
- `src/chat/IbChatViewProvider.ts` - agent picker on session create
- `webview/ib-chat/src/main.ts` - dynamic rendering
- `package.json` - new setting for ACP agents
