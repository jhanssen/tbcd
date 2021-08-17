#include "Decoder.h"
#include "Log.h"
#include "Screen.h"
#include "Utils.h"
#include <gif_lib.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <algorithm>
#include <conio.h>

struct GifData
{
    const unsigned char* data;
    const size_t size;
    size_t cur;
};

const short interlacedOffset[] = { 0, 4, 2, 1 }; /* The way Interlaced image should. */
const short interlacedJumps[]  = { 8, 8, 4, 2 }; /* be read - offsets and jumps... */

static int readGif(GifFileType* file, GifByteType* bytes, int len)
{
    GifData* data = (GifData*)file->UserData;
    const int num = std::min<int>(len, data->size - data->cur);
    if (num > 0) {
        memcpy(bytes, data->data + data->cur, num);
        data->cur += num;
    }
    return num;
}

Decoder::Image::Image(unsigned short w, unsigned short h, unsigned char* d, unsigned short nc, unsigned char* p)
    : width(w), height(h), data(d), numColors(nc), palette(p)
{
}

Decoder::Image::~Image()
{
    if (data)
        free(data);
    if (palette)
        free(palette);
}

void Decoder::Image::draw(unsigned short x, unsigned short y)
{
    if (x >= 320 || y >= 200)
        return;
    unsigned char* VGA = Screen::screen()->ptr();
    const unsigned short endy = std::min<unsigned short>(200, y + height);
    const unsigned short endx = std::min<unsigned short>(320, x + width);
    for (unsigned short line = y; line < endy; ++line) {
        memcpy(VGA + ((line * 320) + x), data + ((line - y) * width), endx - x);
    }
}

void Decoder::Image::applyPalette()
{
    outp(0x3c8, 0);
    unsigned short j = 0;
    for (unsigned short i = 0; i < numColors; ++i) {
        outp(0x3c9, palette[j++]);
        outp(0x3c9, palette[j++]);
        outp(0x3c9, palette[j++]);
    }
    for (unsigned short i = numColors; i < 256; ++i) {
        outp(0x3c9, 0);
        outp(0x3c9, 0);
        outp(0x3c9, 0);
    }

    reservePalette();
}

Ref<Decoder::Image> Decoder::decode(const unsigned char* data, size_t size)
{
    GifData gdata = { data, size, 0 };
    GifFileType* file = DGifOpen(&gdata, readGif);
    if (file == 0) {
        return Ref<Decoder::Image>();
    }

    int i;

    const int swidth = file->SWidth;
    const int sheight = file->SHeight;

    unsigned char* lines = (unsigned char*)malloc(swidth * sheight);
    if (!lines) {
        DGifCloseFile(file);
        return Ref<Decoder::Image>();
    }
    unsigned char* palette = (unsigned char*)malloc(768);
    if (!palette) {
        DGifCloseFile(file);
        free(lines);
        return Ref<Decoder::Image>();
    }

    // set to background color
    for (i = 0; i < swidth * sheight; ++i) {
        lines[i] = file->SBackGroundColor;
    }

    unsigned short numColors = 0;
    int j, extcode, count, row, col, width, height;
    GifRecordType record;
    GifByteType* extension;
    ColorMapObject* colorMap;

    do {
        if (DGifGetRecordType(file, &record) == GIF_ERROR) {
            DGifCloseFile(file);
            free(lines);
            free(palette);
            return Ref<Decoder::Image>();
        }

        switch (record) {
        case IMAGE_DESC_RECORD_TYPE:
            if (DGifGetImageDesc(file) == GIF_ERROR) {
                DGifCloseFile(file);
                free(lines);
                free(palette);
                return Ref<Decoder::Image>();
            }
            if (file->Image.Left + file->Image.Width > swidth ||
                file->Image.Top + file->Image.Height > sheight) {
                DGifCloseFile(file);
                free(lines);
                free(palette);
                return Ref<Decoder::Image>();
            }

            j = 0;
            colorMap = file->Image.ColorMap ? file->Image.ColorMap : file->SColorMap;
            numColors = colorMap->ColorCount;
            for (i = 0; i < numColors; ++i) {
                GifColorType* color = &colorMap->Colors[i];
                palette[j++] = color->Red >> 2;
                palette[j++] = color->Green >> 2;
                palette[j++] = color->Blue >> 2;
            }

            row = file->Image.Top;
            col = file->Image.Left;
            width = file->Image.Width;
            height = file->Image.Height;

            if (file->Image.Interlace) {
                for (count = i = 0; i < 4; ++i) {
                    for (j = row + interlacedOffset[i]; j < row + height; j += interlacedJumps[i]) {
                        if (DGifGetLine(file, lines + ((j * swidth) + col), width) == GIF_ERROR) {
                            DGifCloseFile(file);
                            free(lines);
                            free(palette);
                            return Ref<Decoder::Image>();
                        }
                    }
                }
            } else {
                for (i = 0; i < height; ++i) {
                    const int off = ((row++ * swidth) + col);
                    if (DGifGetLine(file, lines + off, width) == GIF_ERROR) {
                        DGifCloseFile(file);
                        free(lines);
                        free(palette);
                        return Ref<Decoder::Image>();
                    }
                }
            }

            DGifCloseFile(file);
            return Ref<Decoder::Image>(new Decoder::Image(swidth, sheight, lines, numColors, palette));
        case EXTENSION_RECORD_TYPE:
            if (DGifGetExtension(file, &extcode, &extension) == GIF_ERROR) {
                DGifCloseFile(file);
                free(lines);
                free(palette);
                return Ref<Decoder::Image>();
            }
            while (extension != 0) {
                if (DGifGetExtensionNext(file, &extension) == GIF_ERROR) {
                    DGifCloseFile(file);
                    free(lines);
                    free(palette);
                    return Ref<Decoder::Image>();
                }
            }
            break;
        case TERMINATE_RECORD_TYPE:
            break;
        }
    } while (record != TERMINATE_RECORD_TYPE);

    DGifCloseFile(file);
    free(lines);
    free(palette);
    return Ref<Decoder::Image>();
}

Ref<Decoder::Image> Decoder::decode(const char* file)
{
    FILE* f = fopen(file, "rb");
    if (f == 0)
        return Ref<Decoder::Image>();

    enum { DataIncrement = 16384 };
    int datasize = DataIncrement;
    int datacur = 0;
    unsigned char* data = (unsigned char*)malloc(datasize);

    char buf[128];
    while (!feof(f)) {
        size_t n = fread(buf, 1, sizeof(buf), f);
        if (n > 0) {
            if (datacur + n >= datasize) {
                // realloc
                data = (unsigned char*)realloc(data, datasize + DataIncrement);
                datasize += DataIncrement;
            }
            memcpy(data + datacur, buf, n);
            datacur += n;
        }
    }
    fclose(f);

    Ref<Decoder::Image> ret = decode(data, datacur);
    free(data);
    return ret;
}
