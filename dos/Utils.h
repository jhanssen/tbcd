#ifndef UTILS_H
#define UTILS_H

#include "Buffer.h"
#include "Ref.h"

void reservePalette();
void wait(int ticks);

Ref<U8Buffer> readFile(const char* file);

void fillRect(unsigned short x, unsigned short y,
              unsigned short w, unsigned short h,
              unsigned char c);

#endif
