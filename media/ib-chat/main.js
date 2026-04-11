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
//#region webview/ib-chat/src/main.ts
function t(e, t) {
	let n = document.createElement("div");
	n.className = "trace-step";
	let r = document.createElement("span");
	r.className = "trace-bullet", r.textContent = "●", r.setAttribute("aria-hidden", "true");
	let i = document.createElement("div");
	i.className = "trace-body";
	let a = document.createElement("div");
	if (a.className = "trace-line", a.textContent = e, i.append(a), t !== void 0 && t.length > 0) {
		let e = document.createElement("div");
		e.className = "trace-details";
		for (let n of t) {
			let t = document.createElement("div");
			t.className = "trace-detail", t.textContent = n, e.append(t);
		}
		i.append(e);
	}
	return n.append(r, i), n;
}
function n() {
	let e = document.createElement("div");
	e.className = "diff-frame";
	let t = document.createElement("div");
	t.className = "diff-frame-header", t.textContent = "package.json -5";
	let n = document.createElement("pre");
	n.className = "diff-frame-body";
	for (let e of [
		{ text: "{ \"commands\": [" },
		{ text: "    {" },
		{
			text: "-      \"command\": \"ib-utilities.showIbChat\",",
			remove: !0
		},
		{ text: "      \"title\": \"Show IB Chat\"," }
	]) {
		let t = document.createElement("span");
		t.style.display = "block", e.remove === !0 && (t.className = "diff-line-remove"), t.textContent = e.text, n.append(t);
	}
	let r = document.createElement("div");
	return r.className = "diff-frame-footer", r.textContent = "... truncated (2 more lines) · ctrl+r to review", e.append(t, n, r), e;
}
function r(e, r, i) {
	e.replaceChildren(), e.className = "root agent-root";
	let a = document.createElement("header");
	a.className = "agent-header";
	let o = document.createElement("div");
	o.className = "agent-title-line";
	let s = document.createTextNode("IB Chat Agent "), c = document.createElement("span");
	c.className = "agent-version", c.textContent = r.agentVersionLabel ?? "", o.append(s, c);
	let l = document.createElement("div");
	l.className = "agent-meta-line";
	let u = r.workspaceLabel !== void 0 && r.workspaceLabel.length > 0 ? r.workspaceLabel : "No workspace folder open";
	l.textContent = u, l.title = u, a.append(o, l);
	let d = document.createElement("section");
	d.className = "user-prompt-bar", d.setAttribute("aria-label", "User request"), d.textContent = "Remove the show ib chat button in the view and remove the extra new ib chat keep the editor one";
	let f = document.createElement("main");
	f.className = "agent-trace", f.setAttribute("role", "log"), f.setAttribute("aria-label", "Agent trace"), f.append(t("Searching the codebase for \"Show IB Chat\" and related commands."), t("Grepped 2 greps", ["Grepped \"Show IB Chat|showIbChat|show.*ib.*chat\" in ."]), t("Read 2 files", ["Read src/chat/IbChatViewProvider.ts", "Read package.json lines 70-289"]));
	let p = document.createElement("div");
	p.className = "agent-summary", p.textContent = "Removing the Chats view title entries for \"Show IB Chat\" and duplicate \"New IB Chat\" (addIbChatSession), keeping newIbChatEditor. Removing the unused commands and cleaning up the sessions view.", f.append(p, n());
	let m = document.createElement("footer");
	m.className = "composer";
	let h = document.createElement("textarea");
	h.className = "composer-input", h.placeholder = "Message the agent…", h.setAttribute("aria-label", "Agent input");
	let g = document.createElement("button");
	g.type = "button", g.className = "composer-send", g.textContent = "Send", g.addEventListener("click", () => {
		let e = h.value.trim();
		e.length !== 0 && (i(e), h.value = "");
	}), m.append(h, g), e.append(a, d, f, m);
}
var i = document.getElementById("root");
if (!i) throw Error("Missing #root");
var a = e();
a.onExtensionMessage((e) => {
	e.type === "init" && r(i, e, (e) => {
		a.post({
			type: "send",
			body: e
		});
	});
}), a.post({ type: "ready" });
//#endregion
