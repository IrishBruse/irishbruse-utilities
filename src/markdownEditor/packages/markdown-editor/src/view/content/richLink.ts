import { patchDomNodes } from './dom.js';

export type LinkPresentationKind =
	| 'resource'
	| 'issue'
	| 'pullRequest'
	| 'commit'
	| 'file'
	| 'folder'
	| 'session'
	| 'repository'
	| 'branch';

export type LinkPresentationStatusKind =
	| 'neutral'
	| 'pending'
	| 'success'
	| 'warning'
	| 'error'
	| 'open'
	| 'closed'
	| 'merged'
	| 'draft'
	| 'notPlanned';

export interface LinkPresentationStatus {
	readonly kind: LinkPresentationStatusKind;
	readonly label: string;
}

export interface LinkPresentationChanges {
	readonly insertions: number;
	readonly deletions: number;
}

/**
 * Declarative rendering data for one link. `kind` selects the package-owned
 * visual treatment; providers never supply DOM or CSS.
 */
export interface LinkPresentation {
	readonly kind: LinkPresentationKind;
	readonly title?: string;
	readonly detail?: string;
	readonly reference?: string;
	/** Primary resource state, such as pull-request lifecycle or session state. */
	readonly status?: LinkPresentationStatus;
	/** Secondary state, such as pull-request CI status. */
	readonly secondaryStatus?: LinkPresentationStatus;
	readonly changes?: LinkPresentationChanges;
	readonly tooltip?: string;
	readonly ariaLabel?: string;
}

export interface RichLinkOptions {
	readonly href: string;
	readonly authoredLabel: string;
	readonly presentation?: LinkPresentation;
}

export class RichLink {
	static create(options: RichLinkOptions): RichLink {
		const element = document.createElement('span');
		element.dataset.mdUrl = options.href;
		element.setAttribute('role', 'link');
		element.tabIndex = 0;
		const authoredLabel = document.createElement('span');
		authoredLabel.textContent = options.authoredLabel;
		const result = new RichLink(element, authoredLabel);
		result.update(options.presentation);
		return result;
	}

	static mount(element: HTMLElement, authoredLabel: HTMLSpanElement): RichLink {
		return new RichLink(element, authoredLabel);
	}

	static clear(element: HTMLElement): void {
		element.classList.remove('md-rich-link', 'md-rich-link-unavailable');
		delete element.dataset.mdRichLinkKind;
		delete element.dataset.mdRichLinkStatus;
		delete element.dataset.mdRichLinkSecondaryStatus;
		element.removeAttribute('aria-label');
		element.removeAttribute('title');
	}

	readonly element: HTMLElement;
	readonly authoredLabel: HTMLSpanElement;

	private readonly _icon: HTMLSpanElement;
	private readonly _title: HTMLSpanElement;
	private readonly _detail: HTMLSpanElement;
	private readonly _reference: HTMLSpanElement;
	private readonly _changes: RichLinkChangesDom;
	private readonly _status: RichLinkStatusDom;
	private readonly _secondaryStatus: RichLinkStatusDom;

	private constructor(element: HTMLElement, authoredLabel: HTMLSpanElement) {
		this.element = element;
		this.authoredLabel = authoredLabel;
		this._icon = document.createElement('span');
		this._icon.className = 'md-rich-link-icon codicon';
		this._icon.setAttribute('aria-hidden', 'true');
		this._title = document.createElement('span');
		this._title.className = 'md-rich-link-title';
		this._detail = document.createElement('span');
		this._detail.className = 'md-rich-link-detail';
		this._reference = document.createElement('span');
		this._reference.className = 'md-rich-link-reference';
		this._changes = createRichLinkChangesDom();
		this._status = createRichLinkStatusDom('md-rich-link-primary-status');
		this._secondaryStatus = createRichLinkStatusDom('md-rich-link-secondary-status');
		this.authoredLabel.className = 'md-rich-link-label';
		this.element.classList.add('md-rich-link');
		this._setDefaultOrder();
	}

	update(presentation: LinkPresentation | undefined): void {
		if (!presentation) {
			this._renderUnavailable();
			return;
		}

		this.element.classList.remove('md-rich-link-unavailable');
		this.element.dataset.mdRichLinkKind = presentation.kind;
		this._icon.className = `md-rich-link-icon codicon codicon-${richLinkIcons[presentation.kind]}`;
		this.authoredLabel.hidden = Boolean(presentation.title);
		this._title.textContent = presentation.title ?? '';
		this._title.hidden = !presentation.title;
		this._detail.textContent = presentation.detail ?? '';
		this._detail.hidden = !presentation.detail;
		this._reference.textContent = presentation.reference ?? '';
		this._reference.hidden = !presentation.reference;
		updateRichLinkChanges(this._changes, presentation.changes);
		updateRichLinkStatus(this.element, presentation.kind, this._status, presentation.status, 'mdRichLinkStatus');
		updateRichLinkStatus(this.element, presentation.kind, this._secondaryStatus, presentation.secondaryStatus, 'mdRichLinkSecondaryStatus');
		patchDomNodes(this.element, hasLeadingLifecycleStatus(presentation)
			? [this._status.root, this.authoredLabel, this._title, this._detail, this._reference, this._changes.root, this._secondaryStatus.root]
			: [this._icon, this.authoredLabel, this._title, this._detail, this._reference, this._changes.root, this._status.root, this._secondaryStatus.root]);
		if (presentation.ariaLabel) {
			this.element.setAttribute('aria-label', presentation.ariaLabel);
		} else {
			this.element.removeAttribute('aria-label');
		}
		if (presentation.tooltip) {
			this.element.title = presentation.tooltip;
		} else {
			this.element.removeAttribute('title');
		}
	}

	private _renderUnavailable(): void {
		this.element.classList.add('md-rich-link-unavailable');
		delete this.element.dataset.mdRichLinkKind;
		delete this.element.dataset.mdRichLinkStatus;
		delete this.element.dataset.mdRichLinkSecondaryStatus;
		this._setDefaultOrder();
		this._icon.className = 'md-rich-link-icon codicon codicon-link';
		this.authoredLabel.hidden = false;
		this._title.hidden = true;
		this._detail.hidden = true;
		this._reference.hidden = true;
		resetRichLinkChanges(this._changes);
		resetRichLinkStatus(this._status);
		resetRichLinkStatus(this._secondaryStatus);
		this.element.removeAttribute('aria-label');
		this.element.removeAttribute('title');
	}

	private _setDefaultOrder(): void {
		patchDomNodes(this.element, [
			this._icon,
			this.authoredLabel,
			this._title,
			this._detail,
			this._reference,
			this._changes.root,
			this._status.root,
			this._secondaryStatus.root,
		]);
	}
}

interface RichLinkStatusDom {
	readonly root: HTMLSpanElement;
	readonly icon: HTMLSpanElement;
	readonly label: HTMLSpanElement;
	pixelSpinner?: HTMLSpanElement;
}

interface RichLinkChangesDom {
	readonly root: HTMLSpanElement;
	readonly insertions: HTMLSpanElement;
	readonly deletions: HTMLSpanElement;
}

const richLinkIcons: Readonly<Record<LinkPresentationKind, string>> = {
	resource: 'link',
	issue: 'issues',
	pullRequest: 'git-pull-request',
	commit: 'git-commit',
	file: 'file',
	folder: 'folder',
	session: 'comment-discussion',
	repository: 'repo',
	branch: 'git-branch',
};

function createRichLinkStatusDom(className: string): RichLinkStatusDom {
	const root = document.createElement('span');
	root.className = `md-rich-link-status ${className}`;
	const icon = document.createElement('span');
	icon.className = 'md-rich-link-status-icon codicon';
	icon.setAttribute('aria-hidden', 'true');
	const label = document.createElement('span');
	label.className = 'md-rich-link-status-label';
	root.append(icon, label);
	return { root, icon, label };
}

function createRichLinkChangesDom(): RichLinkChangesDom {
	const root = document.createElement('span');
	root.className = 'md-rich-link-changes';
	const insertions = document.createElement('span');
	insertions.className = 'md-rich-link-insertions';
	const deletions = document.createElement('span');
	deletions.className = 'md-rich-link-deletions';
	root.append(insertions, deletions);
	return { root, insertions, deletions };
}

function updateRichLinkChanges(dom: RichLinkChangesDom, changes: LinkPresentationChanges | undefined): void {
	if (!changes) {
		resetRichLinkChanges(dom);
		return;
	}
	dom.insertions.textContent = `+${changes.insertions}`;
	dom.deletions.textContent = `-${changes.deletions}`;
	dom.root.hidden = false;
}

function resetRichLinkChanges(dom: RichLinkChangesDom): void {
	dom.insertions.textContent = '';
	dom.deletions.textContent = '';
	dom.root.hidden = true;
}

function updateRichLinkStatus(
	element: HTMLElement,
	presentationKind: LinkPresentationKind,
	dom: RichLinkStatusDom,
	status: LinkPresentationStatus | undefined,
	dataKey: 'mdRichLinkStatus' | 'mdRichLinkSecondaryStatus',
): void {
	if (!status) {
		delete element.dataset[dataKey];
		resetRichLinkStatus(dom);
		return;
	}
	element.dataset[dataKey] = status.kind;
	const spinnerVariant = getSessionSpinnerVariant(presentationKind, status.kind);
	dom.icon.className = `md-rich-link-status-icon codicon codicon-${getRichLinkStatusIcon(presentationKind, status.kind)}`;
	dom.icon.hidden = spinnerVariant !== undefined;
	if (spinnerVariant) {
		dom.pixelSpinner ??= createPixelSpinner(dom.label);
		dom.pixelSpinner.classList.toggle('monaco-pixel-spinner-ring', spinnerVariant === 'ring');
	} else {
		dom.pixelSpinner?.remove();
		dom.pixelSpinner = undefined;
	}
	dom.label.textContent = status.label;
	dom.root.hidden = false;
}

function resetRichLinkStatus(dom: RichLinkStatusDom): void {
	dom.icon.hidden = false;
	dom.pixelSpinner?.remove();
	dom.pixelSpinner = undefined;
	dom.label.textContent = '';
	dom.root.hidden = true;
}

function createPixelSpinner(before: HTMLSpanElement): HTMLSpanElement {
	const spinner = document.createElement('span');
	spinner.className = 'md-rich-link-status-icon monaco-pixel-spinner';
	spinner.setAttribute('aria-hidden', 'true');
	for (let index = 0; index < 6; index++) {
		const dot = document.createElement('span');
		dot.className = 'monaco-pixel-spinner-dot';
		spinner.appendChild(dot);
	}
	before.before(spinner);
	return spinner;
}

function getSessionSpinnerVariant(
	presentationKind: LinkPresentationKind,
	statusKind: LinkPresentationStatusKind,
): 'grid' | 'ring' | undefined {
	if (presentationKind !== 'session') {
		return undefined;
	}
	switch (statusKind) {
		case 'pending': return 'grid';
		case 'warning': return 'ring';
		default: return undefined;
	}
}

function hasLeadingLifecycleStatus(presentation: LinkPresentation): boolean {
	const statusKind = presentation.status?.kind;
	switch (presentation.kind) {
		case 'issue':
			return statusKind === 'open' || statusKind === 'closed' || statusKind === 'notPlanned';
		case 'pullRequest':
			return statusKind === 'open' || statusKind === 'closed' || statusKind === 'merged' || statusKind === 'draft';
		case 'session':
			return statusKind !== undefined;
		default:
			return false;
	}
}

function getRichLinkStatusIcon(
	presentationKind: LinkPresentationKind,
	statusKind: LinkPresentationStatusKind,
): string {
	if (presentationKind === 'session') {
		switch (statusKind) {
			case 'pending':
			case 'warning':
			case 'success':
			case 'neutral':
				return 'comment-discussion';
			case 'error':
				return 'error';
		}
	}
	switch (statusKind) {
		case 'open': return presentationKind === 'pullRequest' ? 'git-pull-request' : 'issue-opened';
		case 'closed': return presentationKind === 'pullRequest' ? 'git-pull-request-closed' : 'issue-closed';
		case 'merged': return 'git-merge';
		case 'draft': return 'git-pull-request-draft';
		case 'notPlanned': return 'circle-slash';
		case 'pending': return 'circle-filled';
		case 'success': return 'pass-filled';
		case 'warning': return 'warning';
		case 'error': return 'error';
		case 'neutral': return 'circle-outline';
	}
}
