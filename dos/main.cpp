#include "Engine.h"
#include "Log.h"
#include <stdlib.h>

int main(int argc, char** argv)
{
    long int bps = 0;
    if (argc > 1) {
        bps = atol(argv[1]);
    }
    if (bps <= 0) {
        char* env = getenv("TBCD_BPS");
        if (env != 0) {
            bps = atol(env);
        }
        if (bps <= 0)
            bps = 115200L;
    }
    Log::log("before engine %ld\n", bps);
    Engine* engine = new Engine(bps);
    for (;;) {
        if (engine->done())
            break;
        engine->process();
    }
    delete engine;

    return 0;
}
