#ifndef ENGINE_H
#define ENGINE_H

#include "Font.h"
#include "Decoder.h"
#include "List.h"
#include "Screen.h"
#include <string>

class Engine
{
public:
    Engine();
    ~Engine();

    bool done() const { return mDone; }
    void process();
    void cleanup();

private:
    void update();

private:
    bool mDone;
    Font mLargeFont, mSmallFont;
    Ref<Decoder::Image> mImage;
    Screen mScreen;
    List<std::string>* mItems;

    static Engine* sEngine;

    friend void __interrupt __far ctrlCHandler();
    friend void __interrupt __far ctrlBrkHandler();
};

#endif
