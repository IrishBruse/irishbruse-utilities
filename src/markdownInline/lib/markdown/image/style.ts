import { resolveImageUrl } from "./url";

const IMAGE_MAX_WIDTH = 480;
const IMAGE_MAX_HEIGHT = 240;

export function imageZoneKey(url: string | undefined, from: number, documentUrl: string): string {
    const src = url ? resolveImageUrl(url, documentUrl) : undefined;
    return src ? `image:${from}:${src}` : `image:${from}:missing`;
}

function fittedImageHeight(width: number, height: number): number {
    if (width <= 0 || height <= 0) {
        return 0;
    }
    const scale = Math.min(1, IMAGE_MAX_WIDTH / width, IMAGE_MAX_HEIGHT / height);
    return Math.min(IMAGE_MAX_HEIGHT, Math.ceil(height * scale));
}

function imageLabel(alt: string): string {
    if (alt.length > 0) {
        return alt;
    }
    return "Image";
}

function fallbackElement(
    alt: string,
    from: number,
    onReveal: (offset: number) => void,
): HTMLSpanElement {
    const fallback = document.createElement("span");
    fallback.className = "inline-md-image-fallback";
    fallback.textContent = imageLabel(alt);
    fallback.dataset.from = String(from);
    fallback.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onReveal(from + 1);
    });
    return fallback;
}

export interface ImageZoneBody {
    readonly frame: HTMLDivElement;
    heightInPx: number;
}

export function createImageZoneBody(input: {
    alt: string;
    url: string | undefined;
    from: number;
    documentUrl: string;
    lineHeight: number;
    onReveal: (offset: number) => void;
    onLayout: (key: string) => void;
}): ImageZoneBody {
    const src = input.url ? resolveImageUrl(input.url, input.documentUrl) : undefined;
    const frame = document.createElement("div");
    frame.className = "inline-md-block";
    const key = imageZoneKey(input.url, input.from, input.documentUrl);
    const body: ImageZoneBody = { frame, heightInPx: input.lineHeight };
    if (!src) {
        frame.append(fallbackElement(input.alt, input.from, input.onReveal));
        return body;
    }
    let settled = false;
    const showFallback = (): void => {
        if (settled) {
            return;
        }
        settled = true;
        frame.replaceChildren(fallbackElement(input.alt, input.from, input.onReveal));
    };
    const showImage = (width: number, height: number): void => {
        if (settled) {
            return;
        }
        const next = fittedImageHeight(width, height);
        if (next <= 0) {
            showFallback();
            return;
        }
        settled = true;
        const image = document.createElement("img");
        image.className = "inline-md-image";
        image.alt = input.alt;
        image.dataset.from = String(input.from);
        image.addEventListener("mousedown", (event) => {
            event.preventDefault();
            event.stopPropagation();
            input.onReveal(input.from + 1);
        });
        image.src = src;
        frame.replaceChildren(image);
        if (Math.abs(next - body.heightInPx) <= 1) {
            return;
        }
        body.heightInPx = next;
        input.onLayout(key);
    };
    const probe = new Image();
    probe.addEventListener("load", () => {
        showImage(probe.naturalWidth, probe.naturalHeight);
    });
    probe.addEventListener("error", () => {
        showFallback();
    });
    probe.src = src;
    return body;
}
