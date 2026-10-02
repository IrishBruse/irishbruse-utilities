declare module "pngjs" {
    export class PNG {
        width: number;
        height: number;
        data: Uint8Array;
        constructor(options: { width: number; height: number });
        static sync: {
            read(buffer: Buffer): PNG;
            write(png: PNG): Buffer;
        };
    }
}
