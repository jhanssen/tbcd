#ifndef CONNECTION_H
#define CONNECTION_H

#include "Buffer.h"
#include "Decoder.h"
#include "List.h"
#include "Message.h"
#include "Ref.h"
#include "SerialPort.h"
#include "Utils.h"

namespace connection {
struct Availability
{
    int image;
    int queue;
    int item;
    int currentItem;
};

struct Item
{
    Ref<CBuffer> disc;
    Ref<CBuffer> name;
};
} // namespace connection

class Connection
{
public:
    Connection(long int bps = 115200L, SerialPort::ComPort com = SerialPort::ComNone);
    ~Connection();

    void open(SerialPort::ComPort com);
    void close();

    void requestItems();
    void requestImage(const Ref<CBuffer>& item);
    void requestCurrentItem();
    void requestQueue();
    void setCurrentItem(const Ref<CBuffer>& item);
    void setQueue(const Ref<List<Ref<CBuffer> > >& queue);

    void poll(connection::Availability* avails);

    Ref<connection::Item> nextItem();
    Ref<Decoder::Image> nextImage();
    Ref<CBuffer> nextCurrentItem();
    Ref<List<Ref<CBuffer> > > nextQueue();

private:
    bool parseMessage();
    bool parseMessageData(const Ref<U8Buffer>& buf);

    void requestMessage(unsigned short msgId);
    void requestMessagePart(unsigned short msgId, unsigned short partNo);
    void setMessagePartDone(unsigned short msgId, unsigned short partNo);
    void setBaudRate(long int bps);

private:
    SerialPort mSerial;

    int mTopItem;
    List<Ref<connection::Item> > mItems;
    Ref<U8Buffer> mImage;
    Ref<CBuffer> mCurrentItem;
    Ref<List<Ref<CBuffer> > > mQueue;
    long int mBps;
    int mReadOffset;
    U8Buffer mRead;
    Ref<Message> mMessage;
    Timer mMessageTimer;
};

inline Ref<Decoder::Image> Connection::nextImage()
{
    if (mImage) {
        Ref<Decoder::Image> img = Decoder::decode(mImage);
        mImage.reset();
        return img;
    }
    return Ref<Decoder::Image>();
}

inline Ref<connection::Item> Connection::nextItem()
{
    if (mTopItem < mItems.size()) {
        Ref<connection::Item> item = mItems[mTopItem++];
        if (mTopItem == mItems.size()) {
            mTopItem = 0;
            mItems.clear();
        }
        return item;
    }
    return Ref<connection::Item>();
}

inline Ref<CBuffer> Connection::nextCurrentItem()
{
    if (mCurrentItem) {
        Ref<CBuffer> ret = mCurrentItem;
        mCurrentItem.reset();
        return ret;
    }
    return Ref<CBuffer>();
}

inline Ref<List<Ref<CBuffer> > > Connection::nextQueue()
{
    if (mQueue) {
        Ref<List<Ref<CBuffer> > > ret = mQueue;
        mQueue.reset();
        return ret;
    }
    return Ref<List<Ref<CBuffer> > >();
}

#endif // CONNECTION_H
