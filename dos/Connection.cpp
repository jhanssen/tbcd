#include "Connection.h"
#include "Log.h"
#include <assert.h>

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
    mSerial.write("it\0", 3);
}

void Connection::requestImage(const std::string& item)
{
    mSerial.write("im", 2);
    // include the \0 terminate
    mSerial.write(item.c_str(), item.size() + 1);
}

void Connection::requestCurrentItem()
{
    mSerial.write("ci\0", 3);
}

void Connection::setCurrentItem(const std::string& item)
{
    mSerial.write("ci", 2);
    // include the \0 terminate
    mSerial.write(item.c_str(), item.size() + 1);
}

bool Connection::parseMessage()
{
    // first two bytes is the message type
    assert(mReadOffset < mRead.size());
    const unsigned int sz = mRead.size() - mReadOffset;
    const unsigned char* ptr = mRead.ptr() + mReadOffset;
    if (sz < 2)
        return false;
    if (ptr[0] == 'i' && ptr[1] == 't') {
        // item, this consists of a disc name followed by a friendly name
        int fe = -1, le = -1;
        // find two null terminates
        unsigned int n = 2;
        for (; n < sz; ++n) {
            if (ptr[n] == '\0') {
                if (fe == -1) {
                    fe = n;
                } else {
                    le = n;
                    break;
                }
            }
        }
        if (fe != -1 && le != -1) {
            // got em, make us an item
            Ref<connection::Item> item(new connection::Item);
            item->disc.append((const char*)(ptr + 2), fe - 2);
            item->name.append((const char*)(ptr + fe + 1), le - (fe + 1));
            mItems.push(item);

            mReadOffset += le + 1;
            return true;
        }
    } else if (ptr[0] == 'c' && ptr[1] == 'i') {
        // current item, this consists of a disc name
        int fe = -1;
        // find one null terminate
        unsigned int n = 2;
        for (; n < sz; ++n) {
            if (ptr[n] == '\0') {
                fe = n;
                break;
            }
        }
        if (fe != -1) {
            Ref<CBuffer> item(new CBuffer);
            item->append((const char*)(ptr + 2), fe - 2);
            mCurrentItems.push(item);

            mReadOffset += fe + 1;
            return true;
        }
    } else if (ptr[0] == 'i' && ptr[1] == 'm') {
        // image, next two bytes is the unsigned short size and the next n bytes is the image data
        if (sz < 4)
            return false;
        union {
            unsigned short len;
            unsigned char lenbuf[2];
        };
        lenbuf[0] = ptr[2];
        lenbuf[1] = ptr[3];

        Log::log("got image of size %hu\n", len);

        if (len < sz - 4) {
            // looks like we have all the bytes we need
            Ref<U8Buffer> image(new U8Buffer);
            image->append(ptr + 4, len);
            mImages.push(image);

            mReadOffset += len + 4;
            return true;
        }
    }
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
    avails->image = mImages.size() - mTopImage;
    avails->item = mItems.size() - mTopItem;
    avails->currentItem = mCurrentItems.size() - mTopCurrentItem;
}
