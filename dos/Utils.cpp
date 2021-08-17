#include "Utils.h"
#include <conio.h>

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
