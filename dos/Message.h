#ifndef MESSAGE_H
#define MESSAGE_H

#include "Buffer.h"
#include "List.h"
#include "Ref.h"
#include "SerialPort.h"
#include <assert.h>
#include <string.h>

class Message
{
public:
    Message(unsigned short id, unsigned short numParts);
    ~Message() { }

    unsigned short id() const;
    unsigned short current() const;
    unsigned short end() const;

    void addPart(unsigned short no, const Ref<U8Buffer>& part);
    bool isComplete() const;

    Ref<U8Buffer> finalize();

private:
    Message(const Message& other);
    Message& operator=(const Message& other);

    unsigned short mId;
    unsigned int mSize;
    List<Ref<U8Buffer> > mParts;
};

inline Message::Message(unsigned short id, unsigned short numParts)
    : mId(id), mSize(0), mParts(numParts)
{
}

inline unsigned short Message::id() const
{
    return mId;
}

inline unsigned short Message::current() const
{
    return mParts.size();
}

inline unsigned short Message::end() const
{
    return mParts.capacity();
}

inline void Message::addPart(unsigned short no, const Ref<U8Buffer>& part)
{
    assert(no < mParts.capacity() && no == mParts.size());
    mParts.push(part);
    mSize += part->size();
}

inline bool Message::isComplete() const
{
    if (!mSize || mParts.capacity() > mParts.size())
        return false;
    return true;
}

inline Ref<U8Buffer> Message::finalize()
{
    Ref<U8Buffer> ret = Ref<U8Buffer>(new U8Buffer(mSize));
    unsigned char* dst = ret->ptr();
    for (unsigned int i = 0; i < mParts.size(); ++i) {
        memcpy(dst, mParts[i]->ptr(), mParts[i]->size());
        dst += mParts[i]->size();
    }
    mParts.reset();
    mSize = 0;
    return ret;
}

#endif
