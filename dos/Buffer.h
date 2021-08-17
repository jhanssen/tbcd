#ifndef BUFFER_H
#define BUFFER_H

#include <stdlib.h>

template<typename T>
class Buffer
{
public:
    Buffer(int size = 0);
    Buffer(T* ptr, int size);
    ~Buffer();

    int size() const;
    const T* ptr() const;
    T* ptr();

    void realloc(int newsize);

private:
    T* mPtr;
    int mSize;
};

template<typename T>
Buffer<T>::Buffer(T* ptr, int size)
    : mPtr(ptr), mSize(size)
{
}

template<typename T>
Buffer<T>::Buffer(int size)
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
Buffer<T>::~Buffer()
{
    if (mPtr)
        free(mPtr);
}

template<typename T>
void Buffer<T>::realloc(int newsize)
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
inline int Buffer<T>::size() const
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

typedef Buffer<unsigned char> U8Buffer;
typedef Buffer<unsigned short> U16Buffer;

#endif
