#ifndef LIST_H
#define LIST_H

#include <assert.h>
#include <stdlib.h>
#include <algorithm>

template<typename T>
class List
{
public:
    List(unsigned int size = 0);
    List(const List& other);
    ~List();

    List& operator=(const List& other);

    void clear();
    void resize(unsigned int size);

    void push(const T& item);
    void pop();

    unsigned int size() const;

    T& front();
    const T& front() const;
    T& back();
    const T& back() const;

    T& operator[](unsigned int pos);
    const T& operator[](unsigned int pos) const;

private:
    void realloc(unsigned int size);
    void copyFrom(const List& other);

private:
    T* mData;
    unsigned int mCapacity, mSize;
};

template<typename T>
inline List<T>::List(unsigned int size)
    : mData(0), mCapacity(size), mSize(size)
{
    if (size > 0) {
        mData = (T*)malloc(size * sizeof(T));
    }
}

template<typename T>
inline List<T>::List(const List& other)
    : mData(0)
{
    copyFrom(other);
}

template<typename T>
inline List<T>::~List()
{
    clear();
}

template<typename T>
inline List<T>& List<T>::operator=(const List& other)
{
    clear();
    copyFrom(other);
    return *this;
}

template<typename T>
inline void List<T>::realloc(unsigned int size)
{
    if (size > mCapacity) {
        // growth strategy
        unsigned int capacity = mCapacity + std::max<unsigned int>(mCapacity * 2, 64);
        if (size > capacity)
            capacity = size;
        T* data = (T*)malloc(capacity * sizeof(T));
        if (mData) {
            for (unsigned int i = 0; i < mSize; ++i) {
                // copy from the previous one to this one
                new(data + i) T(mData[i]);
                // destroy the old
                mData[i].~T();
            }
            mData = 0;
        }
        mData = data;
        mCapacity = capacity;
    }
}

template<typename T>
inline void List<T>::resize(unsigned int size)
{
    if (!size) {
        clear();
    } else {
        realloc(size);
        mSize = size;
    }
}

template<typename T>
inline void List<T>::copyFrom(const List& other)
{
    assert(mCapacity == 0 && mSize == 0 && mData == 0);
    if (other.mSize > 0) {
        resize(other.mSize);
        for (unsigned int i = 0; i < other.mSize; ++i) {
            new (mData + i) T(other.mData[i]);
        }
    }
}

template<typename T>
inline void List<T>::clear()
{
    if (mData) {
        for (unsigned int i = 0; i < mSize; ++i) {
            mData[i].~T();
        }
        free(mData);

        mData = 0;
    }
    mCapacity = 0;
    mSize = 0;
}

template<typename T>
inline void List<T>::push(const T& item)
{
    if (mSize >= mCapacity)
        realloc(mSize + 1);
    assert(mSize < mCapacity);
    new (mData + mSize) T(item);
    ++mSize;
}

template<typename T>
inline void List<T>::pop()
{
    if (mSize > 0) {
        mData[--mSize].~T();
    }
}

template<typename T>
unsigned int List<T>::size() const
{
    return mSize;
}

template<typename T>
inline T& List<T>::front()
{
    assert(mSize > 0);
    return mData[0];
}

template<typename T>
inline const T& List<T>::front() const
{
    assert(mSize > 0);
    return mData[0];
}

template<typename T>
inline T& List<T>::back()
{
    assert(mSize > 0);
    return mData[mSize - 1];
}

template<typename T>
inline const T& List<T>::back() const
{
    assert(mSize > 0);
    return mData[mSize - 1];
}

template<typename T>
inline T& List<T>::operator[](unsigned int pos)
{
    assert(pos < mSize);
    return mData[pos];
}

template<typename T>
inline const T& List<T>::operator[](unsigned int pos) const
{
    assert(pos < mSize);
    return mData[pos];
}

#endif // LIST_H
