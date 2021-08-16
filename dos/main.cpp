#include "Engine.h"
#include "Log.h"

int main(int, char**)
{
    Log::log("before engine\n");
    Engine engine;
    Log::log("after engine\n");
    for (;;) {
        if (engine.done())
            break;
        engine.process();
    }
    Log::log("engine done\n");

    return 0;
}
