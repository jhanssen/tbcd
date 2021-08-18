#ifndef REF_H
#define REF_H

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
    void reset();

private:
    struct Data
    {
        unsigned short count;
        T* item;
    };
    Data* mData;
};

template<typename T>
inline Ref<T>::Ref()
    : mData(0)
{
}

template<typename T>
inline Ref<T>::Ref(T* item)
    : mData(new Data)
{
    mData->count = 1;
    mData->item = item;
}

template<typename T>
inline Ref<T>::Ref(const Ref& ref)
    : mData(ref.mData)
{
    if (mData) {
        ++mData->count;
    }
}

template<typename T>
inline Ref<T>::~Ref()
{
    if (mData && !--mData->count) {
        delete mData->item;
        delete mData;
    }
}

template<typename T>
inline Ref<T>& Ref<T>::operator=(const Ref& ref)
{
    if (mData && !--mData->count) {
        delete mData->item;
        delete mData;
    }
    mData = ref.mData;
    if (mData) {
        ++mData->count;
    }
    return *this;
}

template<typename T>
T* Ref<T>::release()
{
    if (mData && mData->count == 1) {
        T* item = mData->item;
        delete mData;
        mData = 0;
        return item;
    }
    return 0;
}

template<typename T>
void Ref<T>::reset()
{
    if (mData && !--mData->count) {
        delete mData->item;
        delete mData;
    }
    mData = 0;
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
    return mData->item;
}

template<typename T>
inline const T* Ref<T>::operator->() const
{
    return mData->item;
}

template<typename T>
T& Ref<T>::operator*()
{
    return *mData->item;
}

template<typename T>
const T& Ref<T>::operator*() const
{
    return *mData->item;
}

#endif
