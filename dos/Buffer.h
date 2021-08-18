#ifndef BUFFER_H
#define BUFFER_H

#include "Ref.h"
#include <stdlib.h>
#include <string.h>

template<typename T>
class Buffer
{
public:
    Buffer(unsigned int size = 0);
    Buffer(T* ptr, unsigned int size);
    ~Buffer();

    bool empty() const;
    unsigned int size() const;
    const T* ptr() const;
    T* ptr();

    void realloc(unsigned int newsize);

    void append(const T* ptr, unsigned int size);
    void append(const Ref<Buffer>& buffer);
    void take(Ref<Buffer>& buffer);

    void clear();

private:
    Buffer(const Buffer&);
    Buffer& operator=(const Buffer&);

private:
    T* mPtr;
    unsigned int mSize;
};

template<typename T>
inline Buffer<T>::Buffer(T* ptr, unsigned int size)
    : mPtr(ptr), mSize(size)
{
}

template<typename T>
inline Buffer<T>::Buffer(unsigned int size)
    : mSize(size)
{
    if (size > 0) {
        mPtr = (T*)malloc(size * sizeof(T));
    } else {
        mSize = 0;
        mPtr = 0;
    }
}

template<typename T>
inline Buffer<T>::~Buffer()
{
    if (mPtr)
        free(mPtr);
}

template<typename T>
inline void Buffer<T>::clear()
{
    if (mPtr) {
        free(mPtr);
        mPtr = 0;
    }
    mSize = 0;
}

template<typename T>
inline void Buffer<T>::realloc(unsigned int newsize)
{
    if (newsize <= 0) {
        if (mPtr)
            free(mPtr);
        mPtr = 0;
        mSize = 0;
    } else {
        mPtr = (T*)::realloc(mPtr, newsize * (sizeof T));
        mSize = newsize;
    }
}

template<typename T>
inline void Buffer<T>::append(const T* ptr, unsigned int size)
{
    realloc(mSize + size);
    memcpy(mPtr + mSize, ptr, size);
    mSize += size;
}

template<typename T>
inline void Buffer<T>::append(const Ref<Buffer>& buffer)
{
    if (!buffer)
        return;
    append(buffer->ptr(), buffer->size());
}

template<typename T>
inline void Buffer<T>::take(Ref<Buffer>& buffer)
{
    if (!buffer)
        return;

    if (!mPtr) {
        Buffer* buf = buffer.release();
        if (buf) {
            mSize = buf->mSize;
            mPtr = buf->mPtr;
            buf->mPtr = 0;
            buf->mSize = 0;
            delete buf;
        }
    }
    if (buffer) {
        append(buffer->ptr(), buffer->size());
    }
}

template<typename T>
inline bool Buffer<T>::empty() const
{
    return mSize == 0;
}

template<typename T>
inline unsigned int Buffer<T>::size() const
{
    return mSize;
}

template<typename T>
inline const T* Buffer<T>::ptr() const
{
    return mPtr;
}

template<typename T>
inline T* Buffer<T>::ptr()
{
    return mPtr;
}

typedef Buffer<char> CBuffer;
typedef Buffer<unsigned char> U8Buffer;
typedef Buffer<unsigned short> U16Buffer;

#endif
