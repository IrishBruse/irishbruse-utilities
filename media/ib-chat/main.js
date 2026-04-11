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
	e.innerHTML = "", e.className = "root";
	let n = document.createElement("div");
	n.className = "messages", n.setAttribute("role", "log"), n.setAttribute("aria-label", "Messages");
	let r = document.createElement("div");
	r.className = "bubble assistant";
	let i = document.createElement("div");
	i.className = "label", i.textContent = "Assistant";
	let a = document.createElement("div");
	a.textContent = "This is a placeholder message. Chat will connect here later.", r.append(i, a);
	let o = document.createElement("div");
	o.className = "bubble user";
	let s = document.createElement("div");
	s.className = "label", s.textContent = "You";
	let c = document.createElement("div");
	c.textContent = "Example user message.", o.append(s, c), n.append(r, o);
	let l = document.createElement("div");
	l.className = "composer";
	let u = document.createElement("textarea");
	u.placeholder = "Type a message...", u.setAttribute("aria-label", "Message input");
	let d = document.createElement("button");
	d.type = "button", d.textContent = "Send", d.addEventListener("click", () => {
		let e = u.value.trim();
		e.length !== 0 && (t(e), u.value = "");
	}), l.append(u, d), e.append(n, l);
}
var n = document.getElementById("root");
if (!n) throw Error("Missing #root");
var r = e();
r.onExtensionMessage((e) => {
	e.type === "init" && t(n, (e) => {
		r.post({
			type: "send",
			body: e
		});
	});
}), r.post({ type: "ready" });
//#endregion
