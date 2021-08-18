#include "Connection.h"

Connection::Connection(SerialPort::ComPort com)
    : mTopItem(0), mTopImage(0), mTopCurrentItem(0), mReadOffset(0)
{
    mSerial.open(com);
}

Connection::~Connection()
{
}

void Connection::open(SerialPort::ComPort com)
{
    mSerial.open(com);
}

void Connection::requestItems()
{
}

void Connection::requestBoxshot(const std::string& item)
{
}

void Connection::setCurrentItem(const std::string& item)
{
}

bool Connection::parseMessage()
{
    return false;
}

void Connection::poll(connection::Availability* avails)
{
    if (mSerial.hasData()) {
        Ref<U8Buffer> r = mSerial.read();
        if (r) {
            mRead.take(r);
        }
    }
    if (!mRead.empty()) {
        for (;;) {
            if (!parseMessage())
                break;
        }
        if (mReadOffset == mRead.size()) {
            mRead.clear();
            mReadOffset = 0;
        }
    }
}
