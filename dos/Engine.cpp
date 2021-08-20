#include "Engine.h"
#include "Decoder.h"
#include "Log.h"
#include "Utils.h"
#include <serial.h>
#include <conio.h>
#include <dos.h>
#include <stdio.h>
#include <string.h>

Engine* Engine::sEngine = 0;

#define MAX_SCAN_CODES 0x60

unsigned char normalKeys[MAX_SCAN_CODES] = { 0 };
unsigned char extendedKeys[MAX_SCAN_CODES] = { 0 };
unsigned int currentMode = 0;

void __interrupt __far (*oldCtrlCISR)() = 0;
void __interrupt __far (*oldCtrlBrkISR)() = 0;
void __interrupt __far (*oldKeyboardISR)() = 0;

const char* title = "Ide simulator";

enum {
    BackgroundColor = 254,
    ItemColor = 253,
    HighlightColor = 252,
    SelectedItemColor = 251,
    QueueColor = 250,
    ItemLeft = 10,
    ItemTop = 30,
    ItemHeight = 12,
    BoxshotLeft = 230,
    BoxshotTop = 10,
    BoxshotBottom = 20,
    BoxshotShift = 1,
    BoxAnimationDelay = 10,
    HighlightAnimationDelay = 25,
    ArrowWidth = 5,
    ArrowHeight = 7
};

const char arrow[ArrowHeight][ArrowWidth] = {
    { 0, 0, 1, 0, 0 },
    { 0, 1, 1, 1, 0 },
    { 1, 1, 1, 1, 1 },
    { 0, 1, 1, 1, 0 },
    { 0, 1, 1, 1, 0 },
    { 0, 1, 1, 1, 0 },
    { 0, 1, 1, 1, 0 }
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

static inline void drawArrow(int x, int y, unsigned char color, bool flip)
{
    unsigned char* VGA = Screen::screen()->ptr();
    for (int r = 0; r < ArrowHeight; ++r) {
        for (int c = 0; c < ArrowWidth; ++c) {
            if (arrow[flip ? ArrowHeight - r - 1 : r][c])
                *(VGA + ((y + r) * 320) + x + c) = color;
        }
    }
}

static void __interrupt __far ctrlCHandler()
{
    Engine::sEngine->mDone = true;
}

static void __interrupt __far ctrlBrkHandler()
{
    Engine::sEngine->mDone = true;
}

// #define LOGKEYS

static void __interrupt __far keyboardHandler()
{
    static unsigned char buffer = 0;

    const unsigned char rawcode = inp(0x60);
    const int scancode = rawcode & 0x7F;
    const bool makeBreak = (rawcode & 0x80) == 0;

    if (buffer == 0xe0) { // extended key
        if (scancode < MAX_SCAN_CODES) {
#ifdef LOGKEYS
            Log::log("extended 0x%x %d\n", scancode, makeBreak);
#endif
            extendedKeys[scancode] = makeBreak;
        }
        buffer = 0;
    } else if (buffer >= 0xe1 && buffer <= 0xe2) {
        // skip these
        buffer = 0;
    } else if (rawcode >= 0xe0 && rawcode <= 0xe2) {
        buffer = rawcode;
    } else if (scancode < MAX_SCAN_CODES) {
#ifdef LOGKEYS
        Log::log("normal 0x%x %d\n", scancode, makeBreak);
#endif
        normalKeys[scancode] = makeBreak;
    }

    // finish interrupt
    outp(0x20, 0x20);
}

Engine::Engine(long int bps)
    : mDone(false), mLargeFont(new Font()), mSmallFont(new Font()),
      mItems(new List<Ref<connection::Item> >()), mQueueValues(0),
      mHighlighted(0), mSelected(-1), mFirstItem(0), mVisibleItems(0),
      mConnection(new Connection(bps))
{
    Log::log("engine with bps %ld\n", bps);
    mLargeFont->load("font\\large.bin", 28, 44, 1, 14, 1, " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`{|}~", false);
    mSmallFont->load("font\\small.bin", 16, 48, 1, 8, 0, " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~", true);
    if (!mLargeFont->isValid() || !mSmallFont->isValid()) {
        mDone = true;
        return;
    }

    // mImage = Decoder::decode("TEST2.GIF");
    // if (!mImage.empty()) {
    //     Log::log("decoded %hu %hu\n", mImage->width, mImage->height);
    // }

    sEngine = this;

    // calculate how many items we can fit
    int y = ItemTop;
    while (y + ItemHeight <= 200) {
        ++mVisibleItems;
        y += ItemHeight;
    }

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

    update();

    mConnection->open(SerialPort::Com1);
    mConnection->requestItems();
    mConnection->requestCurrentItem();
    mConnection->requestQueue();
}

Engine::~Engine()
{
    cleanup();
    sEngine = 0;
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
    delete mConnection;
    mConnection = 0;
    delete[] mQueueValues;
    mQueueValues = 0;
    mSmallFont.reset();
    mLargeFont.reset();

    setMode(0x3);
}

void Engine::update()
{
    clear(BackgroundColor);

    mLargeFont->drawText(ItemLeft, 10, BoxshotLeft - 10, 30, 255, title);

    const int max = std::min<int>(mItems->size() - mFirstItem, mVisibleItems);

    int y = ItemTop;
    for (unsigned int i = mFirstItem; i < mFirstItem + max; ++i) {
        if (i == mSelected)  {
            fillRect(ItemLeft - 1, y - 2, BoxshotLeft - 10, y + 10 + 1, SelectedItemColor);
        } else if (i == mHighlighted) {
            fillRect(ItemLeft - 1, y - 2, BoxshotLeft - 10, y + 10 + 1, HighlightColor);
        }
        mSmallFont->drawText(ItemLeft, y, BoxshotLeft - 10, y + 10, ItemColor, mItems->at(i)->name->ptr());

        if (mQueueValues && mQueueValues[i] > 0) {
            char buf[3];
            snprintf(buf, sizeof(buf), "%hu", mQueueValues[i]);
            mSmallFont->drawText(1, y, ItemLeft, y + 10, QueueColor, buf);
        }

        y += ItemHeight;
    }

    drawArrow(BoxshotLeft - 8, ItemTop - 1, mFirstItem > 0 ? ItemColor : SelectedItemColor, false);
    drawArrow(BoxshotLeft - 8, 188, mFirstItem + mVisibleItems >= mItems->size() ? SelectedItemColor : ItemColor, true);
}

struct BoxAnimation
{
    BoxAnimation();

    void reset();
    void draw(const Ref<Decoder::Image>& image, bool force);

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

inline void BoxAnimation::draw(const Ref<Decoder::Image>& image, bool force)
{
    if (++cur == BoxAnimationDelay) {
        if (ydir == 1) {
            fillRect(BoxshotLeft, y - BoxshotShift, BoxshotLeft + image->width, y, BackgroundColor);
        } else {
            fillRect(BoxshotLeft, y + image->height, BoxshotLeft + image->width, y + image->height + BoxshotShift, BackgroundColor);
        }
        if (y == BoxshotTop && ydir == -1)
            ydir = 1;
        if (y == BoxshotBottom && ydir == 1)
            ydir = -1;
        image->draw(BoxshotLeft, y);
        y += (BoxshotShift * ydir);
        cur = 0;
    } else if (force) {
        image->draw(BoxshotLeft, y);
    }
}

struct HighlightAnimation
{
    HighlightAnimation();

    void reset(const Ref<Font>& f, const Ref<CBuffer>& t, int l, unsigned char c);
    void draw(bool force);

    Ref<Font> font;
    Ref<CBuffer> text;
    int line;
    unsigned char color;
    unsigned short right;

    unsigned short left;
    signed short xdir;
    unsigned char cur;
    bool edge, nextEdge;
};

HighlightAnimation::HighlightAnimation()
    : line(0), color(0), left(0), xdir(0), cur(0), edge(false), nextEdge(false)
{
}

inline void HighlightAnimation::reset(const Ref<Font>& f, const Ref<CBuffer>& t, int l, unsigned char c)
{
    font = f;
    text = t;
    line = l;
    color = c;
    left = 0;
    cur = 0;
    edge = true;
    // exclude the \0
    unsigned short width = f->width(t->size() - 1);
    if (width <= BoxshotLeft - 10 - ItemLeft) {
        // no need to animate
        xdir = 0;
        right = 0;
    } else {
        xdir = 1;
        // figure out right limit
        right = 1;
        for (;;) {
            width = f->width(t->size() - 1 - right);
            if (width <= BoxshotLeft - 10 - ItemLeft)
                break;
            ++right;
        }
    }
}

inline void HighlightAnimation::draw(bool force)
{
    if (!xdir)
        return;
    if (++cur == HighlightAnimationDelay) {
        if (edge) {
            edge = false;
            return;
        }
        if (nextEdge) {
            edge = true;
            nextEdge = false;
        }
        const unsigned short y = ItemTop + (ItemHeight * line);
        fillRect(ItemLeft - 1, y - 2, BoxshotLeft - 10, y + 10 + 1, color);
        font->drawText(ItemLeft, y, BoxshotLeft - 10, y + 10, ItemColor, text->ptr() + left);
        left += xdir;
        if (xdir == -1 && left == 0) {
            xdir = 1;
            nextEdge = true;
        } else if (left == right) {
            xdir = -1;
            nextEdge = true;
        }
        cur = 0;
    } else if (force) {
        const unsigned short y = ItemTop + (ItemHeight * line);
        fillRect(ItemLeft - 1, y - 2, BoxshotLeft - 10, y + 10 + 1, color);
        font->drawText(ItemLeft, y, BoxshotLeft - 10, y + 10, ItemColor, text->ptr() + left);
    }
}

void Engine::rebuildQueueValues()
{
    if (mQueueValues)
        delete mQueueValues;
    if (!mQueue || mQueue->empty() || mItems->empty()) {
        mQueueValues = 0;
        return;
    }
    mQueueValues = new unsigned short[mItems->size()];
    memset(mQueueValues, 0, sizeof(unsigned short) * mItems->size());
    for (unsigned int q = 0; q < mQueue->size(); ++q) {
        for (unsigned int i = 0; i < mItems->size(); ++i) {
            if (mQueue->at(q)->compare(*mItems->at(i)->disc) == 0) {
                mQueueValues[i] = q + 1;
                break;
            }
        }
    }
}

void Engine::process()
{
    static BoxAnimation boxAnimation;
    static HighlightAnimation highlightAnimation;

    bool needsUpdate = false;

    // poll connection
    connection::Availability avail;
    mConnection->poll(&avail);
    if (avail.item > 0) {
        // Log::log("got avail %d %d %d\n", avail.item, avail.currentItem, avail.image);
        const bool wasEmpty = mItems->empty();
        Ref<connection::Item> item;
        do {
            item = mConnection->nextItem();
            if (item)
                mItems->push(item);
        } while (item);
        if (wasEmpty && !mItems->empty()) {
            mHighlighted = 0;
            mConnection->requestImage(mItems->at(mHighlighted)->disc);
        }
        if (mSelectedPending) {
            for (unsigned int i = 0; i < mItems->size(); ++i) {
                if (mItems->at(i)->disc->compare(*mSelectedPending) == 0) {
                    mSelected = i;
                    mSelectedPending.reset();
                    break;
                }
            }
        }
        if (mHighlighted < mItems->size()) {
            highlightAnimation.reset(mSmallFont, mItems->at(mHighlighted)->name,
                                     mHighlighted - mFirstItem,
                                     mHighlighted == mSelected ? SelectedItemColor : HighlightColor);
        }
        if (mQueue) {
            rebuildQueueValues();
        }
        needsUpdate = true;
    }
    if (avail.image > 0) {
        Ref<Decoder::Image> img = mConnection->nextImage();
        if (img) {
            img->applyPalette();
            mImage = img;
            needsUpdate = true;
            boxAnimation.reset();
        }
    }
    if (avail.currentItem > 0) {
        mSelected = -1;
        mSelectedPending.reset();

        Ref<CBuffer> current = mConnection->nextCurrentItem();
        if (!current->empty()) {
            // find this in our list of items
            for (unsigned int i = 0; i < mItems->size(); ++i) {
                if (mItems->at(i)->disc->compare(*current) == 0) {
                    mSelected = i;
                    break;
                }
            }
            if (mSelected == -1) {
                mSelectedPending = current;
            } else {
                needsUpdate = true;
            }
        }
    }
    if (avail.queue > 0) {
        mQueue = mConnection->nextQueue();
        rebuildQueueValues();
        needsUpdate = true;
    }

    if (mImagePending && mImageTimer.expired()) {
        mConnection->requestImage(mImagePending);
        mImagePending.reset();
    }

    static bool downPressed = false;
    static bool upPressed = false;
    static bool enterPressed = false;
    // arrow up
    if (extendedKeys[0x48] == 1) {
        upPressed = true;
    } else if (upPressed) {
        upPressed = false;
        if (mHighlighted > 0) {
            if (mHighlighted == mFirstItem)
                --mFirstItem;
            --mHighlighted;
            highlightAnimation.reset(mSmallFont, mItems->at(mHighlighted)->name,
                                     mHighlighted - mFirstItem,
                                     mHighlighted == mSelected ? SelectedItemColor : HighlightColor);
            mImagePending = mItems->at(mHighlighted)->disc;
            mImageTimer.start(18);
            needsUpdate = true;
        }
    }
    // arrow down
    if (extendedKeys[0x50] == 1) {
        downPressed = true;
    } else if (downPressed) {
        downPressed = false;
        if (mHighlighted < mItems->size() - 1) {
            if (mHighlighted - mFirstItem + 1 == mVisibleItems)
                ++mFirstItem;
            ++mHighlighted;
            highlightAnimation.reset(mSmallFont, mItems->at(mHighlighted)->name,
                                     mHighlighted - mFirstItem,
                                     mHighlighted == mSelected ? SelectedItemColor : HighlightColor);
            mImagePending = mItems->at(mHighlighted)->disc;
            mImageTimer.start(18);
            needsUpdate = true;
        }
    }
    // enter
    if (normalKeys[0x1c] == 1 || extendedKeys[0x1c] == 1) {
        enterPressed = true;
    } else if (enterPressed) {
        enterPressed = false;
        // select this item
        mConnection->setCurrentItem(mItems->at(mHighlighted)->disc);
    }
    if (needsUpdate)
        update();

    if (!mImage.empty()) {
        boxAnimation.draw(mImage, needsUpdate);
    }
    highlightAnimation.draw(needsUpdate);

    mScreen.flip();

    // exit if esc is pressed
    if (normalKeys[0x01] == 1)
        mDone = true;
}
