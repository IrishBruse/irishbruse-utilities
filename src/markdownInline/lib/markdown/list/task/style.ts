export const taskCheckboxClass = "inline-md-task";

export function taskSpacerInject(): { readonly content: string; readonly className: string } {
    return {
        content: "\u2610 ",
        className: "inline-md-task-spacer",
    };
}
