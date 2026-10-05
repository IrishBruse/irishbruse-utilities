export function listeningHttpUrl(address: string, port: number): string {
    const colon = address.lastIndexOf(":");
    const host = colon >= 0 ? address.slice(0, colon) : address;
    const bare = host.replace(/^\[/, "").replace(/\]$/, "");
    if (opensOnLocalhost(bare)) {
        return `http://localhost:${port}`;
    }
    if (bare.includes(":")) {
        return `http://[${bare}]:${port}`;
    }
    return `http://${bare}:${port}`;
}

function opensOnLocalhost(host: string): boolean {
    return (
        host === "" ||
        host === "*" ||
        host === "0.0.0.0" ||
        host === "::" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "localhost" ||
        host.includes("%")
    );
}
