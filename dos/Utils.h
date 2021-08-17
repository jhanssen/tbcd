#ifndef UTILS_H
#define UTILS_H

#include "Buffer.h"
#include "Ref.h"

void reservePalette();
Ref<U8Buffer> readFile(const char* file);

#endif
