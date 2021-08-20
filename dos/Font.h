#ifndef FONT_H
#define FONT_H

#include "Buffer.h"
#include "Ref.h"

class Font
{
public:
    Font();
    ~Font();

    void load(const char* file, unsigned short width, unsigned short height,
              unsigned short charwidth, unsigned short charheight,
              unsigned short padrow, const char* charset, bool lowercase);

    void drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const char* text);
    unsigned short width(unsigned short num) const;

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

inline unsigned short Font::width(unsigned short num) const
{
    return num * (mCharWidth * 8);
}

#endif
