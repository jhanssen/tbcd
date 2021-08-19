#include "Engine.h"
#include "Log.h"
#include <stdlib.h>

int main(int argc, char** argv)
{
    long int bps = 0;
    if (argc > 1) {
        Log::log("argc is %d '%s'\n", argc, argv[1]);
        bps = atol(argv[1]);
    }
    if (bps <= 0) {
        bps = 115200L;
    }
    Log::log("before engine %ld\n", bps);
    Engine* engine = new Engine(bps);
    Log::log("after engine\n");
    for (;;) {
        if (engine->done())
            break;
        engine->process();
    }
    Log::log("engine cleaning up\n");
    delete engine;
    Log::log("engine done\n");

    return 0;
}
