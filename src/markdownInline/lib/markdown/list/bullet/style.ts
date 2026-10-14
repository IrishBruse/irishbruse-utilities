export function bulletStyleInject(): { readonly content: string; readonly className: string } {
    return {
        content: "\u2022",
        className: "inline-md-list-mark",
    };
}
