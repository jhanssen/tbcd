#ifndef FONT_H
#define FONT_H

#include <string>
#include <vector>

class Font
{
public:
    Font(const char* file, unsigned short width, unsigned short height,
         unsigned short charwidth, unsigned short charheight,
         unsigned short padrow, const char* charset);
    ~Font();

    void drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const char* text);
    void drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const std::string& text);

    bool isValid() const;

private:
    std::vector<unsigned char> mBuffer;
    std::vector<unsigned short> mGlyphOffsets;
    unsigned short mWidth, mHeight, mCharWidth, mCharHeight;
    unsigned short mPadLeft, mPadTop, mPadRow;
    unsigned char mLow;
};

inline void Font::drawText(unsigned short x0, unsigned short y0, unsigned short x1, unsigned short y1, unsigned char color, const std::string& text)
{
    drawText(x0, y0, x1, y1, color, text.c_str());
}

inline bool Font::isValid() const
{
    return !mBuffer.empty();
}

#endif
