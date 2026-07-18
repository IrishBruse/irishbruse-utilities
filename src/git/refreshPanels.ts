import { refreshActionPanel } from "../actionPanel/refresh";
import { refreshGitHelpersView } from "../gitHelpers/refresh";

export function refreshGitPanels(): void {
    refreshGitHelpersView();
    refreshActionPanel();
}
