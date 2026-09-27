type CommentIcon = 'add' | 'trash';

export function createCommentIcon(icon: CommentIcon): HTMLSpanElement {
	const element = document.createElement('span');
	element.className = `codicon codicon-${icon}`;
	element.setAttribute('aria-hidden', 'true');
	return element;
}
