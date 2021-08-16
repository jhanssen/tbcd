#include "Engine.h"
#include <conio.h>
#include <dos.h>
#include <serial.h>

Engine* Engine::sEngine = 0;

#define MAX_SCAN_CODES 0x60

unsigned char normalKeys[MAX_SCAN_CODES] = { 0 };
unsigned char extendedKeys[MAX_SCAN_CODES] = { 0 };

void __interrupt __far (*oldCtrlCISR)() = 0;
void __interrupt __far (*oldKeyboardISR)() = 0;

static inline void setMode(int mode)
{
    union REGS regs;

    regs.h.ah = 0x00;
    regs.h.al = mode;
    int86(0x10, &regs, &regs);
}

static void __interrupt __far ctrlCHandler()
{
    Engine::sEngine->mDone = true;
}

static void __interrupt __far keyboardHandler()
{
    static unsigned char buffer = 0;
    unsigned char rawcode = inp(0x60);
    int scancode = rawcode & 0x7F;
    const bool makeBreak = (rawcode & 0x80) == 0;

    if (buffer == 0xe0) { // extended key
        if (scancode < MAX_SCAN_CODES)
            extendedKeys[scancode] = makeBreak;
        buffer = 0;
    } else if (buffer >= 0xe1 && buffer <= 0xe2) {
        // skip these
        buffer = 0;
    } else if (rawcode >= 0xe0 && rawcode <= 0xe2) {
        buffer = rawcode;
    } else if (scancode < MAX_SCAN_CODES) {
        normalKeys[scancode] = makeBreak;
    }

    // finish interrupt
    outp(0x20, 0x20);
}

Engine::Engine()
    : mDone(false)
{
    sEngine = this;

    // setup ctrl-c handler
    oldCtrlCISR = _dos_getvect(0x23);
    _dos_setvect(0x23, ctrlCHandler);

    //setup key handler
    oldKeyboardISR = _dos_getvect(0x9);
    _dos_setvect(0x9, keyboardHandler);

    setMode(0x13);
}

Engine::~Engine()
{
    sEngine = 0;

    if (oldCtrlCISR != 0) {
        _dos_setvect(0x23, oldCtrlCISR);
        oldCtrlCISR = 0;
    }
    if (oldKeyboardISR != 0) {
        _dos_setvect(0x9, oldKeyboardISR);
        oldKeyboardISR = 0;
    }

    setMode(0x3);
}

void Engine::process()
{
}
