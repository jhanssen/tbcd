#include "Font.h"
#include "Log.h"
#include <algorithm>
#include <stdio.h>
#include <string.h>
#include <assert.h>

Font::Font(const char* file, unsigned short width, unsigned short height,
           unsigned short charwidth, unsigned short charheight,
           unsigned short padrow, const char* charset)
    : mWidth(width), mHeight(height),
      mCharWidth(charwidth), mCharHeight(charheight),
      mPadRow(padrow)
{
    FILE* f = fopen(file, "r");
    if (f == 0)
        return;
    char buf[512];
    while (!feof(f)) {
        size_t n = fread(buf, 1, sizeof(buf), f);
        if (n > 0) {
            size_t bufsiz = mBuffer.size();
            mBuffer.resize(bufsiz + n);
            memcpy(&mBuffer[0] + bufsiz, buf, n);
        }
    }
    fclose(f);
    Log::log("font read %zu bytes\n", mBuffer.size());

    // build glyph offsets
    // first, figure out the lowest char in charset
    unsigned char low = 255;
    const char* cur = charset;
    while (*cur != '\0') {
        if (*cur < low)
            low = *cur;
        ++cur;
    }
    // now build the offsets
    unsigned short curline = 0;
    unsigned short offset = 0;
    unsigned short nextbreak = width;
    cur = charset;
    while (*cur != '\0') {
        if (*cur >= mGlyphOffsets.size())
            mGlyphOffsets.resize(*cur + 1);
        if (offset + charwidth > nextbreak) {
            // next line
            curline += charheight + padrow;
            offset = curline * width;
            nextbreak = offset + width;
        }
        mGlyphOffsets[*cur] = offset;
        offset += charwidth;
        ++cur;
    }
}

Font::~Font()
{
}

void Font::drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const char* text)
{
    // draw line by line?
    unsigned char far *VGA = (unsigned char far*)0xA0000000L;
    const unsigned short xmax = std::min<unsigned short>(x1, 320);
    const unsigned short ymax = std::min<unsigned short>(y1, 200);
    for (unsigned short y = y0; y < ymax; ++y) {
        if (y - y0 >= mCharHeight)
            break;
        unsigned short x = x0;
        const char* cur = text;
        while (*cur != '\0') {
            char curchar = *cur;
            if (curchar >= 97 && curchar <= 122) {
                // convert a-z to A-Z
                curchar -= 32;
            }
            assert(curchar < mGlyphOffsets.size());
            const unsigned short goffset = mGlyphOffsets[curchar] + ((y - y0) * mWidth);
            for (unsigned short boff = 0; boff < mCharWidth; ++boff) {
                const unsigned char pp = mBuffer[goffset + boff];
                for (unsigned char ip = 0; ip < 8; ++ip) {
                    if (pp & (1 << (7 - ip))) {
                        VGA[320 * y + x + ip] = color;
                    } else {
                        VGA[320 * y + x + ip] = 0;
                    }
                }
            }

            x += (mCharWidth * 8) + 1;
            if (x >= xmax)
                break;

            ++cur;
        }
    }
}