#ifndef SCREEN_H
#define SCREEN_H

#include <string.h>

class Screen
{
public:
    ~Screen();

    static Screen* screen();

    unsigned char* ptr() const;

private:
    Screen();

    void flip() const;

    unsigned char* mPtr;
    static Screen* sScreen;

    friend class Engine;
};

inline Screen* Screen::screen()
{
    return sScreen;
}

inline unsigned char* Screen::ptr() const
{
    return mPtr;
}

inline void Screen::flip() const
{
    // wait for vsync
    _asm {
        push ax
        push dx
        mov dx, 0x3DA
      l1:
        in al, dx
        and al, 0x08
        jnz l1
      l2:
        in al, dx
        and al, 0x08
        jz l2
        pop dx
        pop ax
    }

    unsigned char far* VGA = (unsigned char far*)0xA0000000L;
    memcpy(VGA, mPtr, 320 * 200);
}

#endif
