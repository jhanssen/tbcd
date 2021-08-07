declare module "tga" {
    interface Header
    {
        idlength: number;
        colourMapType: number;
        dataTypeCode: number;
        colourMapOrigin: number;
        colourMapLength: number;
        colourMapDepth: number;
        xOrigin: number;
        yOrigin: number;
        width: number;
        height: number;
        bitsPerPixel: number;
        bytesPerPixel?: number;
        imageDescriptor: number;
    }

    class TGA
    {
        public buffer: Buffer;
        public pixels?: Uint8Array;
        public header?: Header;
        public width?: number;
        public height?: number;
        public bytesPerPixel?: number;
        public isFlipY?: boolean;

        public constructor(buffer: Buffer);
        public static createTgaBuffer(width: number, height: number, pixels: Uint8Array, dontFlipY?: boolean): Buffer;
        public static getHeader(buffer: Buffer): Header;
    }

    export = TGA;
}
