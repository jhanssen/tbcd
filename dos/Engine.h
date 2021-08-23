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
    void rebuildQueueValues();
    void clearQueue();
    void addOrRemoveQueue(int item);

    bool addHighlight(unsigned int delta);
    bool subtractHighlight(unsigned int delta);

private:
    bool mDone;
    Ref<Font> mLargeFont;
    Ref<Font> mSmallFont;
    Timer mImageTimer;
    Ref<CBuffer> mImagePending;
    Ref<Decoder::Image> mImage;
    Screen mScreen;
    List<Ref<connection::Item> >* mItems;
    Ref<List<Ref<CBuffer> > > mQueue;
    unsigned short* mQueueValues;
    unsigned int mHighlighted;
    Ref<CBuffer> mSelectedPending;
    int mSelected;
    unsigned int mFirstItem;
    unsigned int mVisibleItems;
    Connection* mConnection;

    static Engine* sEngine;

    friend void __interrupt __far ctrlCHandler();
    friend void __interrupt __far ctrlBrkHandler();
};

#endif
