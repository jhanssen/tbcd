#ifndef ENGINE_H
#define ENGINE_H

#include "Font.h"

class Engine
{
public:
    Engine();
    ~Engine();

    bool done() const { return mDone; }
    void process();
    void cleanup();

private:
    bool mDone;
    Font mLargeFont, mSmallFont;

    static Engine* sEngine;

    friend void __interrupt __far ctrlCHandler();
    friend void __interrupt __far ctrlBrkHandler();
};

#endif
