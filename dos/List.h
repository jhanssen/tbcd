#ifndef LIST_H
#define LIST_H

#include "Ref.h"
#include <assert.h>
#include <stdlib.h>
#include <algorithm>

template<typename T>
class List : public RefCounted
{
public:
    List(unsigned int size = 0);
    List(const List& other);
    ~List();

    List& operator=(const List& other);

    void reset();
    void clear();
    void resize(unsigned int size);
    void reserve(unsigned int size);

    void push(const T& item);
    void pop();

    void remove(unsigned int item);

    bool empty() const;
    unsigned int size() const;
    unsigned int capacity() const;

    T& front();
    const T& front() const;
    T& back();
    const T& back() const;

    T& operator[](unsigned int pos);
    const T& operator[](unsigned int pos) const;

    T& at(unsigned int pos);
    const T& at(unsigned int pos) const;

private:
    void copyFrom(const List& other);

private:
    T* mData;
    unsigned int mCapacity, mSize;
};

template<typename T>
inline List<T>::List(unsigned int size)
    : mData(0), mCapacity(size), mSize(0)
{
    if (size > 0) {
        mData = (T*)malloc(size * sizeof(T));
    }
}

template<typename T>
inline List<T>::List(const List& other)
    : mData(0), mCapacity(0), mSize(0)
{
    copyFrom(other);
}

template<typename T>
inline List<T>::~List()
{
    reset();
}

template<typename T>
inline List<T>& List<T>::operator=(const List& other)
{
    reset();
    copyFrom(other);
    return *this;
}

template<typename T>
inline void List<T>::reserve(unsigned int size)
{
    if (size > mCapacity) {
        // growth strategy
        unsigned int capacity = mCapacity + std::max<unsigned int>(std::min<unsigned int>(mCapacity * 2, 64), 2);
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
        reset();
    } else {
        reserve(size);
        for (; mSize < size; ++mSize) {
            new (mData + mSize) T;
        }
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
        mSize = 0;
    }
}

template<typename T>
inline void List<T>::reset()
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
        reserve(mSize + 1);
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
inline void List<T>::remove(unsigned int item)
{
    if (item >= mSize)
        return;
    // copy over
    for (unsigned int i = item; i < mSize - 1; ++i) {
        mData[i] = mData[i + 1];
    }
    // destroy last item
    mData[--mSize].~T();
}

template<typename T>
unsigned int List<T>::size() const
{
    return mSize;
}

template<typename T>
unsigned int List<T>::capacity() const
{
    return mCapacity;
}

template<typename T>
bool List<T>::empty() const
{
    return mSize == 0;
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

template<typename T>
T& List<T>::at(unsigned int pos)
{
    assert(pos < mSize);
    return mData[pos];
}

template<typename T>
const T& List<T>::at(unsigned int pos) const
{
    assert(pos < mSize);
    return mData[pos];
}

#endif // LIST_H
