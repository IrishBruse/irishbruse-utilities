/**
 * @vscode/markdown-editor 0.0.2-110 always mounts every document child.
 * Wrap DocumentViewNode.create so the webview can virtualize via
 * globalThis.__ibMdDocumentViewCreate.
 */

const DOCUMENT_CREATE_NEEDLE = `  static create(e, t, s) {
    const i = s?.contentDomNode ?? document.createElement("div");
    i.classList.add("md-document");
    const o = new Map(
      e.children.filter((f) => f.kind === "block").map((f) => [f.view, f.isActive])
    ), r = s?.children, c = e.children.map((f) => f.view), { paired: a, unused: l } = Cn(c, r ?? Jc);
    let d;
    const u = c.map((f, m) => {
      const g = a.get(f);
      if (e.children[m].kind === "pendingParagraph") {
        const _ = f, w = g instanceof ws ? g : new ws(_);
        return w.update(_.text), d = w, w;
      }
      const p = J(f, t, g);
      if (e.children[m].kind === "block") {
        const _ = o.get(f);
        _ !== void 0 && (p.element.classList.toggle("md-block-active", _), p.element.classList.toggle("md-markers-hidden", !_));
        const w = e.children[m].diffKind;
        p.element.classList.toggle("md-diff-added", w === "added"), p.element.classList.toggle("md-diff-modified", w === "modified");
      }
      return p;
    });
    for (const f of l)
      f.dispose();
    Z(i, u.map((f) => f.mountNode));
    const h = [];
    return e.children.forEach((f, m) => {
      f.kind === "block" && h.push({ node: u[m], absoluteStart: f.absoluteStart });
    }), new Sn(e.ast, i, h, u, d);
  }`;

const DOCUMENT_CREATE_REPLACEMENT = `  static create(e, t, s) {
    const originalCreate = (e, t, s) => {
      const i = s?.contentDomNode ?? document.createElement("div");
      i.classList.add("md-document");
      const o = new Map(
        e.children.filter((f) => f.kind === "block").map((f) => [f.view, f.isActive])
      ), r = s?.children, c = e.children.map((f) => f.view), { paired: a, unused: l } = Cn(c, r ?? Jc);
      let d;
      const u = c.map((f, m) => {
        const g = a.get(f);
        if (e.children[m].kind === "pendingParagraph") {
          const _ = f, w = g instanceof ws ? g : new ws(_);
          return w.update(_.text), d = w, w;
        }
        const p = J(f, t, g);
        if (e.children[m].kind === "block") {
          const _ = o.get(f);
          _ !== void 0 && (p.element.classList.toggle("md-block-active", _), p.element.classList.toggle("md-markers-hidden", !_));
          const w = e.children[m].diffKind;
          p.element.classList.toggle("md-diff-added", w === "added"), p.element.classList.toggle("md-diff-modified", w === "modified");
        }
        return p;
      });
      for (const f of l)
        f.dispose();
      Z(i, u.map((f) => f.mountNode));
      const h = [];
      return e.children.forEach((f, m) => {
        f.kind === "block" && h.push({ node: u[m], absoluteStart: f.absoluteStart });
      }), new Sn(e.ast, i, h, u, d);
    };
    const hook = globalThis.__ibMdDocumentViewCreate;
    return typeof hook == "function" ? hook(e, t, s, { originalCreate, createViewNode: J, patchDomNodes: Z, pairNodes: Cn, emptyNodes: Jc, PendingParagraph: ws, DocumentViewNode: Sn }) : originalCreate(e, t, s);
  }`;

/**
 * @param {string} source
 * @returns {string}
 */
export function patchMarkdownEditorDocumentVirtualization(source) {
	if (!source.includes(DOCUMENT_CREATE_NEEDLE)) {
		throw new Error('markdown-editor document virtualization patch: create needle not found');
	}
	return source.replace(DOCUMENT_CREATE_NEEDLE, DOCUMENT_CREATE_REPLACEMENT);
}

/**
 * @param {string} source
 * @returns {string}
 */
export function patchMarkdownEditor(source) {
	return patchMarkdownEditorDocumentVirtualization(source);
}
