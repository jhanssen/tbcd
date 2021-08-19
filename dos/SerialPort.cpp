#include "SerialPort.h"
#include "Log.h"
#include <serial.h>
#include <string.h>

SerialPort::SerialPort()
    : mCom(ComNone)
{
}

SerialPort::~SerialPort()
{
    close();
}

void SerialPort::open(ComPort com, long int bps)
{
    close();

    if (com == ComNone)
        return;

    Log::log("serial open %ld\n", bps);
    const int r = serial_open(com, bps, 8, 'n', 1, SER_HANDSHAKING_RTSCTS);
    if (r == SER_SUCCESS) {
        mCom = com;
    }
}

void SerialPort::close()
{
    if (mCom != ComNone) {
        serial_close(mCom);
        mCom = ComNone;
    }
}

bool SerialPort::isOpen() const
{
    return mCom != ComNone;
}

bool SerialPort::hasData() const
{
    if (mCom == ComNone)
        return false;
    const int r = serial_get_rx_buffered(mCom);
    return r > 0;
}

Ref<U8Buffer> SerialPort::read()
{
    if (mCom == ComNone)
        return Ref<U8Buffer>();

    int r;
    char buf[256];
    Ref<U8Buffer> ret;
    do {
        r = serial_read(mCom, buf, sizeof(buf));
        if (r > 0) {
            if (!ret) {
                ret = Ref<U8Buffer>(new U8Buffer(r));
            } else {
                ret->realloc(ret->size() + r);
            }
            memcpy(ret->ptr() + ret->size() - r, buf, r);
        }
    } while (r == sizeof(buf));
    return ret;
}

bool SerialPort::write(const unsigned char* data, unsigned int size)
{
    if (mCom == ComNone)
        return false;
    int w = serial_write_buffered(mCom, (const char*)data, size);
    if (w >= 0 && w < size) {
        // block until written
        int rem = size - w;
        int off = w;
        while (rem) {
            w = serial_write(mCom, (const char*)data + off, rem);
            if (w >= 0) {
                rem -= w;
                off += w;
            } else {
                // error
                return false;
            }
        }
    } else if (w < 0) {
        // error
        return false;
    }
    return true;
}
