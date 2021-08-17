#include "Utils.h"
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

void reservePalette()
{
    // reserve the last few colors for ourselves
    struct Color
    {
        unsigned char r, g, b;
    };

    Color self[] = {
        { 5,   5,   5   },
        { 225, 225, 225 },
        { 200, 40,  40  },
        { 40,  40,  200 }
    };

    const unsigned short num = sizeof(self) / sizeof(self[0]);
    for (unsigned short n = 255; n > 255 - num; --n) {
        outp(0x3c8, n);
        outp(0x3c9, self[255 - n].r >> 2);
        outp(0x3c9, self[255 - n].g >> 2);
        outp(0x3c9, self[255 - n].b >> 2);
    }
}
