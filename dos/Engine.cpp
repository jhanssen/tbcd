#include "Engine.h"
#include "Decoder.h"
#include "Log.h"
#include "Utils.h"
#include <conio.h>
#include <dos.h>
#include <serial.h>

Engine* Engine::sEngine = 0;

#define MAX_SCAN_CODES 0x60

unsigned char normalKeys[MAX_SCAN_CODES] = { 0 };
unsigned char extendedKeys[MAX_SCAN_CODES] = { 0 };
unsigned int currentMode = 0;

void __interrupt __far (*oldCtrlCISR)() = 0;
void __interrupt __far (*oldCtrlBrkISR)() = 0;
void __interrupt __far (*oldKeyboardISR)() = 0;

inline void waitForVSync()
{
    _asm {
        mov dx, 0x3DA
      l1:
        in al, dx
        and al, 0x08
        jnz l1
      l2:
        in al, dx
        and al, 0x08
        jz l2
    }
}

static inline void setMode(int mode)
{
    if (mode == currentMode)
        return;

    union REGS regs;

    regs.h.ah = 0x00;
    regs.h.al = mode;
    int86(0x10, &regs, &regs);

    currentMode = mode;
}

static void __interrupt __far ctrlCHandler()
{
    Engine::sEngine->mDone = true;
}

static void __interrupt __far ctrlBrkHandler()
{
    Engine::sEngine->mDone = true;
}

static void __interrupt __far keyboardHandler()
{
    static unsigned char buffer = 0;

    const unsigned char rawcode = inp(0x60);
    const int scancode = rawcode & 0x7F;
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
    mLargeFont.load("font\\large.bin", 28, 44, 1, 14, 1, " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`{|}~", false);
    mSmallFont.load("font\\small.bin", 16, 48, 1, 8, 0, " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~", true);
    if (!mLargeFont.isValid() || !mSmallFont.isValid()) {
        mDone = true;
        return;
    }

    mImage = Decoder::decode("TEST2.GIF");
    if (!mImage.empty()) {
        Log::log("decoded %hu %hu\n", mImage->width, mImage->height);
    }

    sEngine = this;

    // setup ctrl-c handler
    oldCtrlCISR = _dos_getvect(0x23);
    _dos_setvect(0x23, ctrlCHandler);

    // setup ctrl-break handler
    oldCtrlBrkISR = _dos_getvect(0x1B);
    _dos_setvect(0x1B, ctrlBrkHandler);

    //setup key handler
    oldKeyboardISR = _dos_getvect(0x9);
    _dos_setvect(0x9, keyboardHandler);

    setMode(0x13);
    reservePalette();

    if (!mImage.empty()) {
        mImage->applyPalette();
    }
}

Engine::~Engine()
{
    sEngine = 0;
    cleanup();
}

void Engine::cleanup()
{
    if (oldCtrlCISR != 0) {
        _dos_setvect(0x23, oldCtrlCISR);
        oldCtrlCISR = 0;
    }
    if (oldCtrlBrkISR != 0) {
        _dos_setvect(0x1B, oldCtrlBrkISR);
        oldCtrlBrkISR = 0;
    }
    if (oldKeyboardISR != 0) {
        _dos_setvect(0x9, oldKeyboardISR);
        oldKeyboardISR = 0;
    }

    setMode(0x3);
}

void Engine::process()
{
    waitForVSync();
    mLargeFont.drawText(10, 10, 100, 100, 255, "0ABabcdtd");
    mSmallFont.drawText(10, 150, 320, 200, 254, "Hello World! the world is blue");

    if (!mImage.empty()) {
        mImage->draw(200, 10);
    }

    // exit if esc is pressed
    if (normalKeys[1] == 1)
        mDone = true;
}
