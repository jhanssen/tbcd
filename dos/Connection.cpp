#include "Connection.h"
#include "Log.h"
#include <assert.h>

#if 1
#define LOGCONN(...) do { } while (0)
#else
#define LOGCONN(...) Log::log(__VA_ARGS__)
#endif

#define MessageTimeout 36
#define BpsWait 27

static inline unsigned short crc16(const void* void_p, unsigned short length)
{
    const unsigned char* data_p = (const unsigned char*)void_p;

    unsigned short crc = 0xffff;
    unsigned char x;
    while (length--){
        x = crc >> 8 ^ *data_p++;
        x ^= x >> 4;
        crc = (crc << 8) ^ ((unsigned short)(x << 12)) ^ ((unsigned short)(x << 5)) ^ ((unsigned short)x);
    }
    return crc;
}

static inline unsigned short readUShort(const unsigned char* ptr)
{
    union {
        unsigned short len;
        unsigned char lenbuf[2];
    };
    lenbuf[0] = ptr[0];
    lenbuf[1] = ptr[1];
    return len;
}

Connection::Connection(long int bps, SerialPort::ComPort com)
    : mTopItem(0), mBps(bps), mReadOffset(0)
{
    if (com != SerialPort::ComNone) {
        Log::log("connection open (ctor) with bps %ld\n", mBps);
        mSerial.open(com, 9600L);
        setBaudRate(mBps);
    }
}

Connection::~Connection()
{
}

void Connection::open(SerialPort::ComPort com)
{
    Log::log("connection open with bps %ld\n", mBps);
    mSerial.open(com, 9600L);
    setBaudRate(mBps);
}

void Connection::close()
{
    long int bps = 9600;
    mSerial.writeNow("ba", 2);
    mSerial.writeNow(&bps, 4);
    wait(BpsWait);
}

void Connection::setBaudRate(long int bps)
{
    Log::log("updating baud rate to %ld\n", bps);
    mSerial.writeNow("ba", 2);
    mSerial.writeNow(&bps, 4);
    mSerial.setBaudRate(bps);
    wait(BpsWait);
}

void Connection::requestItems()
{
    mSerial.write("it\0", 3);
    mTopItem = 0;
    mItems.clear();
}

void Connection::requestMessage(unsigned short msgId)
{
    mSerial.write("br", 2);
    mSerial.write(&msgId, 2);
    msgId = 0xffff;
    mSerial.write(&msgId, 2);
}

void Connection::requestMessagePart(unsigned short msgId, unsigned short partNo)
{
    mSerial.write("br", 2);
    mSerial.write(&msgId, 2);
    mSerial.write(&partNo, 2);
}

void Connection::setMessagePartDone(unsigned short msgId, unsigned short partNo)
{
    mSerial.write("bd", 2);
    mSerial.write(&msgId, 2);
    mSerial.write(&partNo, 2);
}

void Connection::requestQueue()
{
    mSerial.write("qr\0", 3);
    mQueue.reset();
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

void Connection::setQueue(const Ref<List<Ref<CBuffer> > >& queue)
{
    mSerial.write("qs", 2);

    if (queue.empty()) {
        // clear queue
        const unsigned short sz = 0;
        mSerial.write((const unsigned char*)&sz, 2);
        return;
    }

    const unsigned short sz = queue->size();
    // assume little endian
    mSerial.write((const unsigned char*)&sz, 2);

    for (unsigned short i = 0; i < sz; ++i) {
        const Ref<CBuffer>& item = queue->at(i);
        mSerial.write(item->ptr(), item->size());
    }
}

bool Connection::parseMessage()
{
    LOGCONN("top of parse, off %d\n", mReadOffset);
    // first two bytes is the message type
    assert(mReadOffset <= mRead.size());
    const unsigned int sz = mRead.size() - mReadOffset;
    const unsigned char* ptr = mRead.ptr() + mReadOffset;

    if (sz < 6)
        return false;

    unsigned int off = 0;

    // ensure that we have a message
    if (!mMessage) {
        const unsigned short msgId = readUShort(ptr);
        const unsigned short msgNumSlices = readUShort(ptr + 2);
        const unsigned short crc = readUShort(ptr + 4);
        // check the header crc
        const unsigned short hcheck = crc16(ptr, 4);
        if (hcheck != crc) {
            LOGCONN("header crc mismatch 0x%x 0x%x\n", crc, hcheck);
            LOGCONN("%x %x %x %x %x %x %x %x\n",
                     *ptr, *(ptr + 1), *(ptr + 2), *(ptr + 3), *(ptr + 4), *(ptr + 5), *(ptr + 6), *(ptr + 7));
            // bad stuff, need to ask the serial port to resend the full message
            requestMessage(0xffff);

            mReadOffset = mRead.size();
            return false;
        }

        mMessage.reset(new Message(msgId, msgNumSlices));

        off += 6;
        LOGCONN("header crc ok id %hu\n", msgId);
    } else {
        LOGCONN("continuing msg id %hu\n", mMessage->id());
    }

    // process any message chunks
    bool processed = false;
    const unsigned short msgNo = mMessage->current();
    if (sz >= off + 4) {
        const unsigned short len = readUShort(ptr + off);
        const unsigned short pcrc = readUShort(ptr + off + 2);
        LOGCONN("parsing part %hu, needing %hu bytes have %hu\n", msgNo, len, sz - (off + 4));
        // if we have the full length
        if (sz >= off + 4 + len) {
            // crc check the data
            const unsigned short pcheck = crc16(ptr + off + 4, len);
            if (pcheck == pcrc) {
                LOGCONN("part crc ok no %hu\n", msgNo);
                // check out
                Ref<U8Buffer> pbuf(new U8Buffer);
                pbuf->append(ptr + off + 4, len);
                mMessage->addPart(msgNo, pbuf);
                off += 4 + len;
                processed = true;

                setMessagePartDone(mMessage->id(), msgNo);
            } else {
                LOGCONN("part crc mismatch 0x%x 0x%x part %hu len %hu\n", pcrc, pcheck, msgNo, len);

                // bad part, ask for the server to send subsequent parts again
                requestMessagePart(mMessage->id(), msgNo);

                mReadOffset = mRead.size();
                return false;
            }
        }
    }
    mReadOffset += off;
    return processed;
}

bool Connection::parseMessageData(const Ref<U8Buffer>& buffer)
{
    LOGCONN("top of parse\n");
    // first two bytes is the message type
    const unsigned int sz = buffer->size();
    const unsigned char* ptr = buffer->ptr();

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
        if (fe != -1 && le != -1) {
            // got em, make us an item
            Ref<connection::Item> item(new connection::Item);
            item->disc.reset(new CBuffer);
            item->disc->append((const char*)(ptr + 2), fe - 1);
            item->name.reset(new CBuffer);
            item->name->append((const char*)(ptr + fe + 1), le - fe);
            mItems.push(item);

            LOGCONN("item fe %d('%s') le %d('%s')\n", fe, item->disc->ptr(), le, item->name->ptr());
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
        LOGCONN("currentItem fe %d\n", fe);
        if (fe != -1) {
            Ref<CBuffer> item(new CBuffer);
            item->append((const char*)(ptr + 2), fe - 1);
            mCurrentItem = item;

            return true;
        }
    } else if (ptr[0] == 'i' && ptr[1] == 'm') {
        // image, next two bytes is the unsigned short size and the next n bytes is the image data
        if (sz < 4)
            return false;

        // assume we're little endian
        const unsigned short len = readUShort(ptr + 2);
        LOGCONN("got image of size %hu\n", len);

        if (len <= sz - 4) {
            // looks like we have all the bytes we need
            Ref<U8Buffer> image(new U8Buffer);
            image->append(ptr + 4, len);
            mImage = image;

            return true;
        }
    } else if (ptr[0] == 'q' && ptr[1] == 'u') {
        // queue, next two bytes is the unsigned short size
        if (sz < 4)
            return false;

        // assume we're little endian
        const unsigned short len = readUShort(ptr + 2);
        LOGCONN("got queue of size %hu\n", len);

        if (len == 0) {
            mQueue.reset(new List<Ref<CBuffer> >);
        } else {
            mQueue.reset(new List<Ref<CBuffer> >(len));

            unsigned short off = 4;
            for (unsigned short i = 0; i < len; ++i) {
                // find one null terminate
                unsigned int n = off;
                for (; n < sz; ++n) {
                    if (ptr[n] == '\0') {
                        Ref<CBuffer> item(new CBuffer);
                        item->append((const char*)ptr + off, n + 1 - off);
                        // add to pending queue
                        mQueue->push(item);
                        off = n + 1;
                        break;
                    }
                }
            }
        }

        return true;
    } else {
        LOGCONN("unknown fliff %c%c (0x%x 0x%x)\n", ptr[0], ptr[1], ptr[0], ptr[1]);
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

            mMessageTimer.start(MessageTimeout);
        } else {
            LOGCONN("got no bytes from serial\n");
        }

        if (!mRead.empty()) {
            LOGCONN("trying to parse %u bytes at %d\n", mRead.size(), mReadOffset);
            while (parseMessage()) {
                if (mMessage && mMessage->isComplete()) {
                    parseMessageData(mMessage->finalize());
                    mMessage.reset();
                }
            }
            LOGCONN("after parse %u bytes at %d\n", mRead.size(), mReadOffset);
            if (mReadOffset == mRead.size()) {
                LOGCONN("%s\n", "clearing due to all read");
                mRead.clear();
                mReadOffset = 0;
            }
        }
    }
    if (mMessage && mMessageTimer.expired()) {
        // throw everything out and ask the server for the current part
        LOGCONN("%s\n", "clearing due to timeout");
        mRead.clear();
        mReadOffset = 0;

        LOGCONN("message %hu expired, asking for part %hu\n", mMessage->id(), mMessage->current());
        requestMessagePart(mMessage->id(), mMessage->current());
        mMessageTimer.start(MessageTimeout);
    }
    avails->item = mItems.size() - mTopItem;
    avails->image = mImage ? 1 : 0;
    avails->currentItem = mCurrentItem ? 1 : 0;
    avails->queue = mQueue ? 1 : 0;
}
