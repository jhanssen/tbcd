#include "Connection.h"
#include "Log.h"
#include <assert.h>

#if 1
#define LOGCONN(...) do { } while (0)
#else
#define LOGCONN(...) Log::log(__VA_ARGS__)
#endif

Connection::Connection(long int bps, SerialPort::ComPort com)
    : mTopItem(0), mBps(bps), mReadOffset(0)
{
    mSerial.open(com, bps);
}

Connection::~Connection()
{
}

void Connection::open(SerialPort::ComPort com)
{
    mSerial.open(com, mBps);
}

void Connection::requestItems()
{
    mSerial.write("it\0", 3);
    mTopItem = 0;
    mItems.clear();
}

void Connection::requestImage(const Ref<CBuffer>& item)
{
    mSerial.write("im", 2);
    // include the \0 terminate
    mSerial.write(item->ptr(), item->size());
    mImage.reset();
}

void Connection::requestCurrentItem()
{
    mSerial.write("ci\0", 3);
    mCurrentItem.reset();
}

void Connection::setCurrentItem(const Ref<CBuffer>& item)
{
    mSerial.write("ci", 2);
    // include the \0 terminate
    mSerial.write(item->ptr(), item->size());
}

bool Connection::parseMessage()
{
    LOGCONN("top of parse\n");
    // first two bytes is the message type
    assert(mReadOffset <= mRead.size());
    const unsigned int sz = mRead.size() - mReadOffset;
    const unsigned char* ptr = mRead.ptr() + mReadOffset;
    if (sz < 2)
        return false;
    LOGCONN("parse, msg is %c%c (size %u)\n", ptr[0], ptr[1], sz);
    if (ptr[0] == 'i' && ptr[1] == 't') {
        // item, this consists of a disc name followed by a friendly name
        int fe = -1, le = -1;
        // find two null terminates
        unsigned int n = 2;
        LOGCONN("msg it\n");
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
        LOGCONN("msg fe %d le %d\n", fe, le);
        if (fe != -1 && le != -1) {
            // got em, make us an item
            Ref<connection::Item> item(new connection::Item);
            item->disc.reset(new CBuffer);
            item->disc->append((const char*)(ptr + 2), fe - 1);
            item->name.reset(new CBuffer);
            item->name->append((const char*)(ptr + fe + 1), le - fe);
            mItems.push(item);

            mReadOffset += le + 1;
            LOGCONN("msg it done, offset is now %d\n", mReadOffset);
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
            item->append((const char*)(ptr + 2), fe - 1);
            mCurrentItem = item;

            mReadOffset += fe + 1;
            return true;
        }
    } else if (ptr[0] == 'i' && ptr[1] == 'm') {
        // image, next two bytes is the unsigned short size and the next n bytes is the image data
        if (sz < 4)
            return false;

        // assume we're little endian
        union {
            unsigned short len;
            unsigned char lenbuf[2];
        };
        lenbuf[0] = ptr[2];
        lenbuf[1] = ptr[3];

        LOGCONN("got image of size %hu\n", len);

        if (len <= sz - 4) {
            // looks like we have all the bytes we need
            Ref<U8Buffer> image(new U8Buffer);
            image->append(ptr + 4, len);
            mImage = image;

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
            LOGCONN("read %u bytes from serial\n", r->size());
            mRead.take(r);
            LOGCONN("%u bytes now in read\n", mRead.size());
        } else {
            LOGCONN("got no bytes from serial\n");
        }

        if (!mRead.empty()) {
            LOGCONN("trying to parse %u bytes at %d\n", mRead.size(), mReadOffset);
            for (;;) {
                if (!parseMessage())
                    break;
            }
            LOGCONN("after parse %u bytes at %d\n", mRead.size(), mReadOffset);
            if (mReadOffset == mRead.size()) {
                mRead.clear();
                mReadOffset = 0;
            }
        }
    }
    avails->item = mItems.size() - mTopItem;
    avails->image = mImage ? 1 : 0;
    avails->currentItem = mCurrentItem ? 1 : 0;
}
