#include "Font.h"
#include "Log.h"
#include "Screen.h"
#include "Utils.h"
#include <algorithm>
#include <stdio.h>
#include <string.h>
#include <assert.h>

Font::Font()
    : mBuffer(0), mGlyphOffsets(0), mWidth(0), mHeight(0),
      mCharWidth(0), mCharHeight(0), mPadRow(0), mLow(0), mLowercase(0)
{
}

void Font::load(const char* file, unsigned short width, unsigned short height,
                unsigned short charwidth, unsigned short charheight,
                unsigned short padrow, const char* charset, bool lowercase)
{
    mWidth = width;
    mHeight = height;
    mCharWidth = charwidth;
    mCharHeight = charheight;
    mPadRow = padrow;
    mLowercase = lowercase;

    mBuffer = readFile(file);
    if (!mBuffer) {
        Log::log("unable to read file %s\n", file);
        return;
    }
    Log::log("font read %zu bytes\n", mBuffer->size());

    // build glyph offsets
    // first, figure out the lowest char in charset
    unsigned char low = 255;
    const char* cur = charset;
    while (*cur != '\0') {
        if (*cur < low)
            low = *cur;
        ++cur;
    }
    mLow = low;
    // now build the offsets
    unsigned short curline = 0;
    unsigned short offset = 0;
    unsigned short nextbreak = width;
    cur = charset;
    while (*cur != '\0') {
        const unsigned short where = *cur - low;
        if (where >= mGlyphOffsets.size())
            mGlyphOffsets.realloc(where + 1);
        if (offset + charwidth > nextbreak) {
            // next line
            curline += charheight + padrow;
            offset = curline * width;
            nextbreak = offset + width;
        }
        mGlyphOffsets.ptr()[where] = offset;
        offset += charwidth;
        ++cur;
    }
}

Font::~Font()
{
}

void Font::drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const char* text)
{
    unsigned char* VGA = Screen::screen()->ptr();
    unsigned char* buffer = mBuffer->ptr();
    unsigned short* glyphOffsets = mGlyphOffsets.ptr();
    const unsigned short xmax = std::min<unsigned short>(x1, 320);
    const unsigned short ymax = std::min<unsigned short>(y1, 200);
#if 0
    // draw line by line?
    for (unsigned short y = y0; y < ymax; ++y) {
        if (y - y0 >= mCharHeight)
            break;
        unsigned short x = x0;
        const char* cur = text;
        while (*cur != '\0') {
            char curchar = *cur;
            if (!mLowercase && curchar >= 97 && curchar <= 122) {
                // convert a-z to A-Z
                curchar -= 32;
            }
            assert(curchar - mLow < mGlyphOffsets.size());
            const unsigned short goffset = glyphOffsets[curchar - mLow] + ((y - y0) * mWidth);
            for (unsigned short boff = 0; boff < mCharWidth; ++boff) {
                const unsigned char pp = buffer[goffset + boff];
                for (unsigned char ip = 0; ip < 8; ++ip) {
                    if (pp & (1 << (7 - ip))) {
                        VGA[320 * y + x + ip] = color;
                    }
                }
            }

            x += (mCharWidth * 8) + 1;
            if (x >= xmax)
                break;

            ++cur;
        }
    }
#else
    unsigned short x = x0;
    const unsigned short expand = mCharWidth * 8;
    const char* cur = text;
    while (*cur != '\0') {
        char curchar = *cur;
        if (!mLowercase && curchar >= 97 && curchar <= 122) {
            // convert a-z to A-Z
            curchar -= 32;
        }
        const unsigned short goffset = glyphOffsets[curchar - mLow];
        for (unsigned short y = y0; y < ymax; ++y) {
            if (y - y0 >= mCharHeight)
                break;
            for (unsigned short boff = 0; boff < mCharWidth; ++boff) {
                const unsigned char pp = buffer[(goffset + ((y - y0) * mWidth)) + boff];
                if (pp & 128)
                    VGA[320 * y + x] = color;
                if (pp & 64)
                    VGA[320 * y + x + 1] = color;
                if (pp & 32)
                    VGA[320 * y + x + 2] = color;
                if (pp & 16)
                    VGA[320 * y + x + 3] = color;
                if (pp & 8)
                    VGA[320 * y + x + 4] = color;
                if (pp & 4)
                    VGA[320 * y + x + 5] = color;
                if (pp & 2)
                    VGA[320 * y + x + 6] = color;
                if (pp & 1)
                    VGA[320 * y + x + 7] = color;
            }
        }

        x += expand + 1;
        if (x >= xmax)
            break;

        ++cur;
    }
#endif
}
