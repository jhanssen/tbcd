#ifndef REF_H
#define REF_H

class RefCounted
{
public:
    RefCounted();

    void ref();
    bool deref();

    unsigned short refCount() const;

private:
    unsigned short mRefCount;
};

template<typename T>
class Ref
{
public:
    Ref();
    Ref(T* item);
    Ref(const Ref& ref);
    ~Ref();

    Ref& operator=(const Ref& ref);

    bool empty() const;
    operator bool() const;

    T* operator->();
    const T* operator->() const;

    T& operator*();
    const T& operator*() const;

    T* release();
    void reset(T* item = 0);

private:
    T* mData;
};

inline RefCounted::RefCounted()
    : mRefCount(0)
{
}

inline void RefCounted::ref()
{
    ++mRefCount;
}

inline bool RefCounted::deref()
{
    return !--mRefCount;
}

inline unsigned short RefCounted::refCount() const
{
    return mRefCount;
}

template<typename T>
inline Ref<T>::Ref()
    : mData(0)
{
}

template<typename T>
inline Ref<T>::Ref(T* item)
    : mData(item)
{
    if (mData) {
        mData->ref();
    }
}

template<typename T>
inline Ref<T>::Ref(const Ref& ref)
    : mData(ref.mData)
{
    if (mData) {
        mData->ref();
    }
}

template<typename T>
inline Ref<T>::~Ref()
{
    if (mData && mData->deref()) {
        delete mData;
    }
}

template<typename T>
inline Ref<T>& Ref<T>::operator=(const Ref& ref)
{
    if (mData && mData->deref()) {
        delete mData;
    }
    mData = ref.mData;
    if (mData) {
        mData->ref();
    }
    return *this;
}

template<typename T>
T* Ref<T>::release()
{
    if (mData && mData->refCount() == 1) {
        mData->deref();
        T* item = mData;
        mData = 0;
        return item;
    }
    return 0;
}

template<typename T>
void Ref<T>::reset(T* item)
{
    if (mData && mData->deref()) {
        delete mData;
    }
    if (item) {
        mData = item;
        mData->ref();
    } else {
        mData = 0;
    }
}

template<typename T>
inline bool Ref<T>::empty() const
{
    return mData == 0;
}

template<typename T>
inline Ref<T>::operator bool() const
{
    return mData != 0;
}

template<typename T>
inline T* Ref<T>::operator->()
{
    return mData;
}

template<typename T>
inline const T* Ref<T>::operator->() const
{
    return mData;
}

template<typename T>
T& Ref<T>::operator*()
{
    return *mData;
}

template<typename T>
const T& Ref<T>::operator*() const
{
    return *mData;
}

#endif
