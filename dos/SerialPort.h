#ifndef SERIALPORT_H
#define SERIALPORT_H

#include "Buffer.h"
#include "List.h"
#include "Ref.h"

class SerialPort
{
public:
    SerialPort();
    ~SerialPort();

    enum ComPort
    {
        ComNone = -1,
        Com1,
        Com2,
        Com3,
        Com4
    };

    void open(ComPort com, long int bps = 9600);
    void close();

    void setBaudRate(long int bps);

    bool isOpen() const;
    bool hasData() const;

    Ref<U8Buffer> read();

    bool write(const Ref<U8Buffer>& buffer);
    bool write(const void* data, unsigned int size);

    bool writeNow(const Ref<U8Buffer>& buffer);
    bool writeNow(const void* data, unsigned int size);

private:
    ComPort mCom;
};

inline bool SerialPort::write(const Ref<U8Buffer>& buffer)
{
    if (!buffer)
        return false;
    return write(buffer->ptr(), buffer->size());
}

inline bool SerialPort::writeNow(const Ref<U8Buffer>& buffer)
{
    if (!buffer)
        return false;
    return writeNow(buffer->ptr(), buffer->size());
}

#endif // SERIALPORT_H
