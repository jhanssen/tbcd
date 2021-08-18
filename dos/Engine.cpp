#include "Engine.h"
#include "Decoder.h"
#include "Log.h"
#include "Utils.h"
#include <serial.h>
#include <conio.h>
#include <dos.h>
#include <string.h>

Engine* Engine::sEngine = 0;

#define MAX_SCAN_CODES 0x60

unsigned char normalKeys[MAX_SCAN_CODES] = { 0 };
unsigned char extendedKeys[MAX_SCAN_CODES] = { 0 };
unsigned int currentMode = 0;

void __interrupt __far (*oldCtrlCISR)() = 0;
void __interrupt __far (*oldCtrlBrkISR)() = 0;
void __interrupt __far (*oldKeyboardISR)() = 0;

const char* title = "TBCD";

enum {
    BackgroundColor = 254,
    BoxshotLeft = 230,
    BoxshotTop = 10,
    BoxshotBottom = 20,
    BoxshotShift = 1,
    BoxshotDelay = 10
};

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

static void clear(unsigned char color)
{
    unsigned char* VGA = Screen::screen()->ptr();
    memset(VGA, color, 320 * 200);
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
    : mDone(false), mItems(new List<std::string>())
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

    wait(10);

    reservePalette();
    clear(BackgroundColor);

    if (mImage) {
        mImage->applyPalette();
    }

    mItems->push("foo bar");
    mItems->push("hello game");
    update();
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

    delete mItems;
    mItems = 0;

    setMode(0x3);
}

void Engine::update()
{
    clear(BackgroundColor);

    mLargeFont.drawText(10, 10, 100, 100, 255, title);

    int y = 0;
    for (unsigned int i = 0; i < mItems->size(); ++i) {
        mSmallFont.drawText(10, y + 30, BoxshotLeft - 10, y + 40, 253, mItems->at(i));
        y += 10;
    }
}

struct BoxAnimation
{
    BoxAnimation();

    void reset();
    void draw(const Ref<Decoder::Image>& image);

    unsigned short y;
    signed short ydir;
    unsigned char cur;
};

BoxAnimation::BoxAnimation()
    : y(0), ydir(0), cur(0)
{
    reset();
}

inline void BoxAnimation::reset()
{
    y = BoxshotTop;
    ydir = 1;
    cur = 0;
}

inline void BoxAnimation::draw(const Ref<Decoder::Image>& image)
{
    if (++cur == BoxshotDelay) {
        if (ydir == 1) {
            fillRect(BoxshotLeft, y - BoxshotShift, image->width, BoxshotShift, BackgroundColor);
        } else {
            fillRect(BoxshotLeft, y + image->height, image->width, BoxshotShift, BackgroundColor);
        }
        if (y == BoxshotTop && ydir == -1)
            ydir = 1;
        if (y == BoxshotBottom && ydir == 1)
            ydir = -1;
        image->draw(BoxshotLeft, y);
        y += (BoxshotShift * ydir);
        cur = 0;
    }
}

void Engine::process()
{
    if (!mImage.empty()) {
        static BoxAnimation animation;
        animation.draw(mImage);
    }

    mScreen.flip();

    // exit if esc is pressed
    if (normalKeys[1] == 1)
        mDone = true;
}
