#ifndef DECODER_H
#define DECODER_H

#include "Buffer.h"
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

        void applyPalette() const;
        void draw(unsigned short x, unsigned short y) const;

    private:
        Image(unsigned short w, unsigned short h, unsigned char* d, unsigned short nc, unsigned char* p);

        Image(const Image&);
        Image& operator=(const Image&);

        friend class Decoder;
    };

    static Ref<Image> decode(const char* file);
    static Ref<Image> decode(const unsigned char* data, unsigned int size);
    static Ref<Image> decode(const Ref<U8Buffer>& buffer);
};

inline Ref<Decoder::Image> Decoder::decode(const Ref<U8Buffer>& buffer)
{
    if (!buffer)
        return Ref<Image>();
    return decode(buffer->ptr(), buffer->size());
}

#endif
