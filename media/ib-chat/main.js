//#region webview/ib-chat/src/host.ts
function e() {
	let e = acquireVsCodeApi();
	return {
		post(t) {
			e.postMessage(t);
		},
		onExtensionMessage(e) {
			window.addEventListener("message", (t) => {
				e(t.data);
			});
		}
	};
}
//#endregion
//#region webview/ib-chat/src/ui.ts
function t(e) {
	let t = document.createElement("section");
	return t.className = "user-prompt-bar", t.setAttribute("aria-label", "User message"), t.textContent = e, t;
}
function n() {
	let e = document.createElement("div");
	e.className = "agent-response-stream";
	let t = document.createElement("pre");
	return t.className = "agent-response-text", t.setAttribute("aria-label", "Agent response"), e.append(t), {
		wrap: e,
		pre: t
	};
}
function r(e, t, n, r) {
	let a = document.createElement("div");
	a.className = "tool-call-card", a.dataset.toolId = e;
	let o = document.createElement("div");
	o.className = "tool-call-head";
	let s = document.createElement("span");
	s.className = "tool-call-spinner", s.setAttribute("aria-hidden", "true");
	let c = document.createElement("span");
	c.className = "tool-call-title", c.textContent = t;
	let l = document.createElement("span");
	l.className = "tool-call-kind", l.textContent = n ?? "", l.hidden = n === void 0 || n.length === 0, o.append(s, c, l);
	let u = document.createElement("div");
	return u.className = "tool-call-detail", u.hidden = !0, a.append(o, u), i(a, r ?? "pending"), a;
}
function i(e, t) {
	e.dataset.status = t;
	let n = e.querySelector(".tool-call-spinner");
	n instanceof HTMLElement && (t === "in_progress" || t === "pending" ? (n.textContent = "◌", n.className = "tool-call-spinner tool-call-spinner--running") : t === "completed" ? (n.textContent = "✓", n.className = "tool-call-spinner tool-call-spinner--done") : (n.textContent = "✕", n.className = "tool-call-spinner tool-call-spinner--failed"));
}
function a(e, t, n) {
	i(e, t);
	let r = e.querySelector(".tool-call-detail");
	r instanceof HTMLElement && n !== void 0 && n.trim().length > 0 && (r.textContent = n, r.hidden = !1);
}
function o(e) {
	let t = document.createElement("div");
	t.className = "agent-plan", t.setAttribute("aria-label", "Agent plan");
	let n = document.createElement("div");
	n.className = "agent-plan-title", n.textContent = "Plan", t.append(n);
	for (let n of e) {
		let e = document.createElement("div");
		e.className = "agent-plan-row";
		let r = document.createElement("span");
		r.className = "agent-plan-status", r.textContent = n.status;
		let i = document.createElement("span");
		i.className = "agent-plan-content", i.textContent = n.content, n.priority !== void 0 && (e.title = `priority: ${n.priority}`), e.append(r, i), t.append(e);
	}
	return t;
}
function s(e, i, s, c) {
	if (e.replaceChildren(), e.className = "root agent-root", i.vscodeThemeVariables) for (let [e, t] of Object.entries(i.vscodeThemeVariables)) document.documentElement.style.setProperty(e, t);
	let l = document.createElement("header");
	l.className = "agent-header";
	let u = document.createElement("div");
	u.className = "agent-title-line";
	let d = document.createTextNode("IB Chat "), f = document.createElement("span");
	f.className = "agent-version", f.textContent = i.agentVersionLabel ?? "", u.append(d, f);
	let p = document.createElement("div");
	p.className = "agent-meta-line";
	let m = i.workspaceLabel !== void 0 && i.workspaceLabel.length > 0 ? i.workspaceLabel : "No workspace folder open";
	if (p.textContent = m, p.title = m, l.append(u, p), i.acpAgentName !== void 0 && i.acpAgentName.length > 0) {
		let e = document.createElement("div");
		e.className = "agent-acp-name", e.textContent = `ACP agent: ${i.acpAgentName}`, l.append(e);
	}
	let h = document.createElement("div");
	h.className = "ib-chat-error", h.setAttribute("role", "alert"), h.hidden = !0;
	let g = document.createElement("main");
	g.className = "agent-trace", g.setAttribute("role", "log"), g.setAttribute("aria-label", "Conversation");
	let _ = document.createElement("footer");
	_.className = "composer-frame";
	let v = document.createElement("textarea");
	v.className = "composer-input", v.placeholder = "Describe a task or reply to the agent…", v.setAttribute("aria-label", "Agent input"), v.rows = 2;
	let y = document.createElement("div");
	y.className = "composer-footer";
	let b = document.createElement("span");
	b.className = "composer-hint", b.textContent = "Enter to send · Shift+Enter for newline";
	let x = document.createElement("button");
	x.type = "button", x.className = "composer-cancel", x.textContent = "Cancel", x.disabled = !0;
	let S = document.createElement("button");
	S.type = "button", S.className = "composer-send", S.textContent = "Send";
	let C = !1, w = null, T = /* @__PURE__ */ new Map();
	function E(e) {
		C = e, v.disabled = e, S.disabled = e, x.disabled = !e;
	}
	function D() {
		w = null;
	}
	function O(e) {
		g.append(e), g.scrollTop = g.scrollHeight;
	}
	function k() {
		if (w !== null) return w;
		let { wrap: e, pre: t } = n();
		return w = t, O(e), t;
	}
	let A = () => {
		if (C) return;
		let e = v.value.trim();
		e.length !== 0 && (O(t(e)), v.value = "", s(e), E(!0), h.hidden = !0, D(), T.clear());
	};
	x.addEventListener("click", () => {
		c();
	}), S.addEventListener("click", A), v.addEventListener("keydown", (e) => {
		e.key === "Enter" && !e.shiftKey && (e.preventDefault(), A());
	}), y.append(b, x, S), _.append(v, y), e.append(l, h, g, _);
	function j(e) {
		switch (e.type) {
			case "appendAgentText": {
				let t = k();
				t.textContent += e.text, g.scrollTop = g.scrollHeight;
				break;
			}
			case "appendToolCall": {
				D();
				let t = r(e.toolCallId, e.title, e.kind, e.status);
				T.set(e.toolCallId, t), O(t);
				break;
			}
			case "updateToolCall": {
				let t = T.get(e.toolCallId);
				if (t) a(t, e.status, e.content);
				else {
					let t = r(e.toolCallId, "Tool", void 0, e.status);
					a(t, e.status, e.content), T.set(e.toolCallId, t), D(), O(t);
				}
				g.scrollTop = g.scrollHeight;
				break;
			}
			case "appendPlan":
				D(), O(o(e.entries));
				break;
			case "turnComplete":
				D(), E(!1);
				break;
			case "error":
				D(), h.textContent = e.message, h.hidden = !1, E(!1);
				break;
		}
	}
	return { handleMessage: j };
}
//#endregion
//#region webview/ib-chat/src/main.ts
var c = document.getElementById("root");
if (!c) throw Error("Missing #root");
var l = e(), u = null;
l.onExtensionMessage((e) => {
	if (e.type === "init") {
		u = s(c, e, (e) => {
			l.post({
				type: "send",
				body: e
			});
		}, () => {
			l.post({ type: "cancel" });
		});
		return;
	}
	u?.handleMessage(e);
}), l.post({ type: "ready" });
//#endregion
