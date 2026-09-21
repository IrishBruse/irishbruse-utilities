import { EditorController } from './editorController';
import { EditorView } from './editorView';
import { EditorModel, Selection, StringValue } from '../core/index';
import './editorBase.css';
import './markdownEditor.css';

export const LAYOUT_FIXTURE = `## How to try features

1. Click a table cell to edit Markdown in that cell.
2. Leave a **code fence** idle to see the **language badge**.
3. On a mermaid fence, use Open Preview.

## Headings H1-H6
`;

export interface LayoutHarness {
	readonly model: EditorModel;
	readonly view: EditorView;
}

export function mountLayoutHarness(host: HTMLElement, source = LAYOUT_FIXTURE): LayoutHarness {
	const model = new EditorModel();
	model.sourceText.set(new StringValue(source), undefined);
	const view = new EditorView(model, {
		showReadonlyToggle: false,
		classNames: ['md-theme-vscode-default'],
	});
	new EditorController(model, view);
	host.append(view.element);
	return { model, view };
}

export function activateFirstList(model: EditorModel): void {
	const list = model.document.get().blocks.find(block => block.kind === 'list');
	if (!list) {
		throw new Error('Expected a list block');
	}
	model.selection.set(Selection.collapsed(list.start + 2), undefined);
}

const host = document.getElementById('editor');
if (host) {
	const app = mountLayoutHarness(host);
	Object.assign(window, { __mdEditor: app, activateFirstList });
}
