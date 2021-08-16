TARGET := tbcd.exe

ifeq ($(WATCOM),)
    $(error No WATCOM variable set)
endif
ifeq ($(WATCOM_PREFIX),)
    WATCOM_PREFIX := "binl64"
endif

CC=$(WATCOM)/$(WATCOM_PREFIX)/wcl
CXX=$(WATCOM)/$(WATCOM_PREFIX)/wcl
LINK=$(WATCOM)/$(WATCOM_PREFIX)/owcc

INCLUDE=$(WATCOM)/h
SRCDIR := .

export PATH := $(WATCOM)/$(WATCOM_PREFIX):$(PATH)

SOURCES_CPP=$(patsubst %.cpp, %.cpp.o, $(shell find $(SRCDIR) -name "*.cpp"))
SOURCES_C=$(patsubst %.c, %.c.o, $(shell find $(SRCDIR) -name "*.c"))

SERIAL_INCLUDE := ${CURDIR}/serial

CXX_FLAGS := -bt=dos -w3 -zq -d+
C_FLAGS := -bt=dos -za99 -w3 -zq -d+
LINK_FLAGS := -bdos -mcmodel=s

all: link

compile: $(SOURCES_CPP) $(SOURCES_C)

%.cpp.o: %.cpp Makefile
	$(CXX) $< -fo=$@ -c -cc++ $(CXX_FLAGS) -i=$(INCLUDE):$(SERIAL_INCLUDE)

%.c.o: %.c Makefile
	$(CC) $< -fo=$@ -c -cc $(C_FLAGS) -i=$(INCLUDE):$(SERIAL_INCLUDE)

link: compile $(TARGET)
	$(LINK) $(LINK_FLAGS) $(SOURCES_CPP) $(SOURCES_C) -o $(TARGET)
