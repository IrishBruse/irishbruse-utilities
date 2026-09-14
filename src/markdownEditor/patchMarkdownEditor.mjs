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
