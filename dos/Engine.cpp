#include "Engine.h"
#include <dos.h>
#include <serial.h>

Engine* Engine::sEngine = 0;

void __interrupt __far (*oldCtrlCISR)() = 0;

static inline void setMode(int mode)
{
    union REGS regs;

    regs.h.ah = 0x00;
    regs.h.al = mode;
    int86(0x10, &regs, &regs);
}

static void __interrupt __far ctrlCHandler()
{
    Engine::sEngine->mDone = true;
}

Engine::Engine()
    : mDone(false)
{
    sEngine = this;

    // setup ctrl-c handler
    oldCtrlCISR = _dos_getvect(0x23);
    _dos_setvect(0x23, ctrlCHandler);

    setMode(0x13);
}

Engine::~Engine()
{
    sEngine = 0;

    if (oldCtrlCISR != 0) {
        _dos_setvect(0x23, oldCtrlCISR);
    }

    setMode(0x3);
}

void Engine::process()
{
}
