#ifndef FONT_H
#define FONT_H

#include "Buffer.h"
#include "Ref.h"
#include <string>

class Font
{
public:
    Font();
    ~Font();

    void load(const char* file, unsigned short width, unsigned short height,
              unsigned short charwidth, unsigned short charheight,
              unsigned short padrow, const char* charset, bool lowercase);

    void drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const char* text);
    void drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const std::string& text);

    bool isValid() const;

private:
    Ref<U8Buffer> mBuffer;
    U16Buffer mGlyphOffsets;
    unsigned short mWidth, mHeight, mCharWidth, mCharHeight;
    unsigned short mPadLeft, mPadTop, mPadRow;
    unsigned char mLow;
    bool mLowercase;
};

inline bool Font::isValid() const
{
    return !mBuffer.empty();
}

inline void Font::drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const std::string& text)
{
    drawText(x0, y0, x1, y1, color, text.c_str());
}

#endif
