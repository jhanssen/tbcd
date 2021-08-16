#include "Log.h"
#include <stdarg.h>
#include <stdio.h>

void Log::log(const char* fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    char buf[512];
    const int w = vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);

    FILE* f = fopen("tbcd.log", "a");
    if (!f) {
        fprintf(stderr, "%s", buf);
    } else {
        int off = 0;
        while (off < w) {
            const size_t ww = fwrite(buf + off, 1, w - off, f);
            if (!ww)
                break;
            off += ww;
        }
        fclose(f);
    }
}
