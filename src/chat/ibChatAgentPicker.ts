import { window } from "vscode";
import { getAcpAgentConfigs, type AcpAgentConfig } from "./acp/acpAgentConfig";

/**
 * Lets the user pick an ACP agent from configured entries. Returns undefined if
 * none are configured or the user dismisses the picker.
 */
export async function pickAcpAgentConfig(): Promise<AcpAgentConfig | undefined> {
    const configs = getAcpAgentConfigs();
    if (configs.length === 0) {
        void window.showInformationMessage(
            "No ACP agents configured. Add entries to ib-utilities.acpAgents in settings."
        );
        return undefined;
    }
    if (configs.length === 1) {
        return configs[0];
    }
    const labels = configs.map((c) => c.name);
    const picked = await window.showQuickPick(labels, { placeHolder: "Select an ACP agent for this chat" });
    if (!picked) {
        return undefined;
    }
    return configs.find((c) => c.name === picked);
}
