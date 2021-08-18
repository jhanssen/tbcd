#include "Utils.h"
#include "Screen.h"
#include <conio.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Ref<U8Buffer> readFile(const char* file)
{
    FILE* f = fopen(file, "rb");
    if (f == 0)
        return Ref<U8Buffer>();

    enum { DataIncrement = 8192 };
    int datasize = DataIncrement;
    int datacur = 0;
    unsigned char* data = (unsigned char*)malloc(datasize);

    while (!feof(f)) {
        if (datasize - datacur < 128) {
            // realloc
            data = (unsigned char*)realloc(data, datasize + DataIncrement);
            datasize += DataIncrement;
        }
        datacur += fread(data + datacur, 1, datasize - datacur, f);
    }
    fclose(f);

    return Ref<U8Buffer>(new U8Buffer(data, datacur));
}

void wait(int ticks)
{
    unsigned short* CLOCK = (unsigned short*)0x0000046C;
    const unsigned short start = *CLOCK;
    while (*CLOCK - start < ticks)
        ;
}

void reservePalette()
{
    // reserve the last few colors for ourselves
    struct Color
    {
        unsigned char r, g, b;
    };

    const Color self[] = {
        { 5,   5,   5   }, // black
        { 225, 225, 225 }, // white
        { 180, 40,  40  }, // darker red
        { 225, 180, 180 }, // lighter red
        { 190, 190, 190 }  // light grey
    };

    const unsigned short num = sizeof(self) / sizeof(self[0]);
    for (unsigned short n = 255; n > 255 - num; --n) {
        outp(0x3c8, n);
        outp(0x3c9, self[255 - n].r >> 2);
        outp(0x3c9, self[255 - n].g >> 2);
        outp(0x3c9, self[255 - n].b >> 2);
    }
}

void fillRect(unsigned short x0, unsigned short y0,
              unsigned short x1, unsigned short y1,
              unsigned char c)
{
    unsigned char* VGA = Screen::screen()->ptr();
    for (unsigned short yy = y0; yy < y1; ++yy) {
        memset(VGA + (yy * 320) + x0, c, x1 - x0);
    }
}
