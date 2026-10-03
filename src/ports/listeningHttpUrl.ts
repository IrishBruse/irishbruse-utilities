export function listeningHttpUrl(address: string, port: number): string {
    const colon = address.lastIndexOf(":");
    const host = colon >= 0 ? address.slice(0, colon) : address;
    const bare = host.replace(/^\[/, "").replace(/\]$/, "");
    if (bare === "" || bare === "*" || bare === "0.0.0.0" || bare === "::" || bare.includes("%")) {
        return `http://127.0.0.1:${port}`;
    }
    if (bare.includes(":")) {
        return `http://[${bare}]:${port}`;
    }
    return `http://${bare}:${port}`;
}
