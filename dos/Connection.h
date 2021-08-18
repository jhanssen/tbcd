#ifndef CONNECTION_H
#define CONNECTION_H

#include "Buffer.h"
#include "Decoder.h"
#include "Ref.h"
#include "SerialPort.h"
#include "List.h"
#include <string>

namespace connection {
struct Availability
{
    int image;
    int item;
    int currentItem;
};

struct Item
{
    CBuffer disc;
    CBuffer name;
};
} // namespace connection

class Connection
{
public:
    Connection(SerialPort::ComPort com = SerialPort::ComNone);
    ~Connection();

    void open(SerialPort::ComPort com);

    void requestItems();
    void requestImage(const std::string& item);
    void requestCurrentItem();
    void setCurrentItem(const std::string& item);

    void poll(connection::Availability* avails);

    Ref<Decoder::Image> nextImage();
    Ref<connection::Item> nextItem();
    Ref<CBuffer> nextCurrentItem();

private:
    bool parseMessage();

private:
    SerialPort mSerial;

    int mTopItem;
    List<Ref<connection::Item> > mItems;

    int mTopImage;
    List<Ref<U8Buffer> > mImages;

    int mTopCurrentItem;
    List<Ref<CBuffer> > mCurrentItems;

    int mReadOffset;
    U8Buffer mRead;
};

inline Ref<Decoder::Image> Connection::nextImage()
{
    if (mTopImage < mImages.size()) {
        Ref<U8Buffer> image = mImages[mTopImage++];
        if (mTopImage == mImages.size())
            mImages.clear();
        return Decoder::decode(image);
    }
    return Ref<Decoder::Image>();
}

inline Ref<connection::Item> Connection::nextItem()
{
    if (mTopItem < mItems.size()) {
        Ref<connection::Item> item = mItems[mTopItem++];
        if (mTopItem == mItems.size())
            mItems.clear();
        return item;
    }
    return Ref<connection::Item>();
}

inline Ref<CBuffer> Connection::nextCurrentItem()
{
    if (mTopCurrentItem < mCurrentItems.size()) {
        Ref<CBuffer> item = mCurrentItems[mTopCurrentItem++];
        if (mTopCurrentItem == mCurrentItems.size())
            mCurrentItems.clear();
        return item;
    }
    return Ref<CBuffer>();
}

#endif // CONNECTION_H
