/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vscodeKeyboardProfile } from '@vscode/markdown-editor';

/**
 * VS Code Markdown editor keys: Enter is smart enter (new paragraph or list
 * continuation). Shift+Enter inserts a hard line break (two trailing spaces).
 */
export const markdownEditorKeyboardProfile = vscodeKeyboardProfile;
