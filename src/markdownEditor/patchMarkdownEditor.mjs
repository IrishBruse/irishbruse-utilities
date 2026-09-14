/**
 * @vscode/markdown-editor skips micromark `autolink` and `htmlText` tokens.
 * Those ranges become hidden glue. Patch the parser to keep the raw source.
 */

const INLINE_SWITCH_NEEDLE = `        case "image":
          e.push(this._parseImage());
          return;`;

const INLINE_SWITCH_REPLACEMENT = `        case "image":
          e.push(this._parseImage());
          return;
        case "autolink":
        case "htmlText":
          e.push(this._parseRawInline(t.tokenType));
          return;`;

const PARSE_IMAGE_END_NEEDLE = `    return { node: new Ie(s, i, t.build(r.endOffset - e.startOffset)), start: e.startOffset };
  }
  _notExit(e) {`;

const PARSE_RAW_INLINE_METHOD = `    return { node: new Ie(s, i, t.build(r.endOffset - e.startOffset)), start: e.startOffset };
  }
  _parseRawInline(t) {
    const e = this._consume("enter", t);
    for (; this._notExit(t); )
      this._idx++;
    const r = this._consume("exit", t);
    return { node: new Qe(this._source.substring(e.startOffset, r.endOffset)), start: e.startOffset };
  }
  _notExit(e) {`;

const DOCUMENT_CREATE_NEEDLE = `static create(e, t, s) {
    const i = s?.contentDomNode ?? document.createElement("div");
    i.classList.add("md-document");
    const o = new Map(
      e.children.filter((f) => f.kind === "block").map((f) => [f.view, f.isActive])
    ), r = s?.children, c = e.children.map((f) => f.view), { paired: a, unused: l } = nn(c, r ?? zr);
    let d;
    const u = c.map((f, m) => {
      const g = a.get(f);
      if (e.children[m].kind === "pendingParagraph") {
        const p = f, w = g instanceof Wn ? g : new Wn(p);
        return w.update(p.text), d = w, w;
      }
      const _ = Y(f, t, g);
      if (e.children[m].kind === "block") {
        const p = o.get(f);
        p !== void 0 && (_.element.classList.toggle("md-block-active", p), _.element.classList.toggle("md-markers-hidden", !p));
        const w = e.children[m].diffKind;
        _.element.classList.toggle("md-diff-added", w === "added"), _.element.classList.toggle("md-diff-modified", w === "modified");
      }
      return _;
    });
    for (const f of l)
      f.dispose();
    Q(i, u.map((f) => f.mountNode));
    const h = [];
    return e.children.forEach((f, m) => {
      f.kind === "block" && h.push({ node: u[m], absoluteStart: f.absoluteStart });
    }), new sn(e.ast, i, h, u, d);
  }`;

const DOCUMENT_CREATE_REPLACEMENT = `static create(e, t, s) {
    const originalCreate = (e, t, s) => {
      const i = s?.contentDomNode ?? document.createElement("div");
      i.classList.add("md-document");
      const o = new Map(
        e.children.filter((f) => f.kind === "block").map((f) => [f.view, f.isActive])
      ), r = s?.children, c = e.children.map((f) => f.view), { paired: a, unused: l } = nn(c, r ?? zr);
      let d;
      const u = c.map((f, m) => {
        const g = a.get(f);
        if (e.children[m].kind === "pendingParagraph") {
          const p = f, w = g instanceof Wn ? g : new Wn(p);
          return w.update(p.text), d = w, w;
        }
        const _ = Y(f, t, g);
        if (e.children[m].kind === "block") {
          const p = o.get(f);
          p !== void 0 && (_.element.classList.toggle("md-block-active", p), _.element.classList.toggle("md-markers-hidden", !p));
          const w = e.children[m].diffKind;
          _.element.classList.toggle("md-diff-added", w === "added"), _.element.classList.toggle("md-diff-modified", w === "modified");
        }
        return _;
      });
      for (const f of l)
        f.dispose();
      Q(i, u.map((f) => f.mountNode));
      const h = [];
      return e.children.forEach((f, m) => {
        f.kind === "block" && h.push({ node: u[m], absoluteStart: f.absoluteStart });
      }), new sn(e.ast, i, h, u, d);
    };
    const hook = globalThis.__ibMdDocumentViewCreate;
    return typeof hook == "function" ? hook(e, t, s, { originalCreate, createViewNode: Y, patchDomNodes: Q, pairNodes: nn, emptyNodes: zr, PendingParagraph: Wn, DocumentViewNode: sn }) : originalCreate(e, t, s);
  }`;

/**
 * @param {string} source
 * @returns {string}
 */
export function patchMarkdownEditorParse(source) {
	if (!source.includes(INLINE_SWITCH_NEEDLE)) {
		throw new Error('markdown-editor parse patch: inline switch needle not found');
	}
	if (!source.includes(PARSE_IMAGE_END_NEEDLE)) {
		throw new Error('markdown-editor parse patch: _parseImage needle not found');
	}
	return source
		.replace(INLINE_SWITCH_NEEDLE, INLINE_SWITCH_REPLACEMENT)
		.replace(PARSE_IMAGE_END_NEEDLE, PARSE_RAW_INLINE_METHOD);
}

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
	return patchMarkdownEditorDocumentVirtualization(patchMarkdownEditorParse(source));
}
