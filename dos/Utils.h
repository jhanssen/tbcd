#ifndef UTILS_H
#define UTILS_H

#include "Buffer.h"
#include "Ref.h"

void reservePalette();

class Timer
{
public:
    Timer(unsigned short ticks = 0);

    void start(unsigned short ticks);
    bool expired() const;

private:
    unsigned long mWhen;
    mutable unsigned long mWraps;
};

void wait(unsigned short ticks);

Ref<U8Buffer> readFile(const char* file);

void fillRect(unsigned short x0, unsigned short y0,
              unsigned short x1, unsigned short y1,
              unsigned char c);

#endif
