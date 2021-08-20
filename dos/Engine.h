#ifndef ENGINE_H
#define ENGINE_H

#include "Buffer.h"
#include "Connection.h"
#include "Font.h"
#include "Decoder.h"
#include "List.h"
#include "Screen.h"
#include "Utils.h"
#include <string>

class Engine
{
public:
    Engine(long int bps);
    ~Engine();

    bool done() const { return mDone; }
    void process();
    void cleanup();

private:
    void update();

private:
    bool mDone;
    Ref<Font> mLargeFont;
    Ref<Font> mSmallFont;
    Timer mImageTimer;
    Ref<CBuffer> mImagePending;
    Ref<Decoder::Image> mImage;
    Screen mScreen;
    List<Ref<connection::Item> >* mItems;
    unsigned int mHighlighted;
    Ref<CBuffer> mSelectedPending;
    int mSelected;
    int mFirstItem;
    int mVisibleItems;
    Connection* mConnection;

    static Engine* sEngine;

    friend void __interrupt __far ctrlCHandler();
    friend void __interrupt __far ctrlBrkHandler();
};

#endif
