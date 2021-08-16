#ifndef ENGINE_H
#define ENGINE_H

class Engine
{
public:
    Engine();
    ~Engine();

    bool done() const { return mDone; }
    void process();

private:
    bool mDone;

    static Engine* sEngine;

    friend void __interrupt ctrlCHandler();
};

#endif
