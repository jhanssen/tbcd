#include "Screen.h"
#include <stdlib.h>

Screen* Screen::sScreen = 0;

Screen::Screen()
{
    sScreen = this;
    mPtr = (unsigned char*)malloc(320 * 200);
}

Screen::~Screen()
{
    free(mPtr);
    sScreen = 0;
}
