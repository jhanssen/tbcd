#ifndef DECODER_H
#define DECODER_H

#include "Ref.h"

class Decoder
{
public:
    class Image
    {
    public:
        ~Image();

        unsigned short width, height;
        unsigned char* data;

        unsigned short numColors;
        unsigned char* palette;

        void applyPalette();
        void draw(unsigned short x, unsigned short y);

    private:
        Image(unsigned short w, unsigned short h, unsigned char* d, unsigned short nc, unsigned char* p);

        friend class Decoder;
    };

    static Ref<Image> decode(const char* file);
    static Ref<Image> decode(const unsigned char* data, unsigned int size);
};

#endif
