#ifndef CONNECTION_H
#define CONNECTION_H

#include "Buffer.h"
#include "Decoder.h"
#include "Ref.h"
#include "SerialPort.h"
#include "List.h"

namespace connection {
struct Availability
{
    int image;
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

    void requestItems();
    void requestImage(const Ref<CBuffer>& item);
    void requestCurrentItem();
    void setCurrentItem(const Ref<CBuffer>& item);

    void poll(connection::Availability* avails);

    Ref<connection::Item> nextItem();
    Ref<Decoder::Image> nextImage();
    Ref<CBuffer> nextCurrentItem();

private:
    bool parseMessage();

private:
    SerialPort mSerial;

    int mTopItem;
    List<Ref<connection::Item> > mItems;
    Ref<U8Buffer> mImage;
    Ref<CBuffer> mCurrentItem;
    long int mBps;
    int mReadOffset;
    U8Buffer mRead;
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

#endif // CONNECTION_H
