#include "Engine.h"

int main(int, char**)
{
    Engine engine;
    for (;;) {
        if (engine.done())
            break;
        engine.process();
    }

    return 0;
}
