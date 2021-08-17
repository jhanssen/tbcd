SRCDIR := .
DSTDIR := ./build

TARGET := $(addprefix $(DSTDIR)/, tbcd.exe)

ifeq ($(WATCOM),)
  $(error No WATCOM variable set)
endif
ifeq ($(WATCOM_PREFIX),)
	WATCOM_PREFIX := "binl64"
endif

CC=$(WATCOM)/$(WATCOM_PREFIX)/wcl
CXX=$(WATCOM)/$(WATCOM_PREFIX)/wcl
LINK=$(WATCOM)/$(WATCOM_PREFIX)/owcc

ifeq (,$(wildcard $(CC)))
  $(error No compiler executable found)
endif

SUBDIRS=serial gif

$(shell mkdir -p $(DSTDIR))
$(foreach sub,$(SUBDIRS),$(shell mkdir -p $(DSTDIR)/$(sub)))

INCLUDE=$(WATCOM)/h

SPACE := $(subst ,, )
EXTRA_INCLUDES := $(foreach sub,$(SUBDIRS),$(SRCDIR)/$(sub))
EXTRA_INCLUDES := $(subst $(SPACE),:,$(EXTRA_INCLUDES))

SOURCES_CPP=$(addprefix $(DSTDIR)/, $(patsubst %.cpp, %.cpp.o, $(shell find $(SRCDIR) -name "*.cpp")))
SOURCES_C=$(addprefix $(DSTDIR)/, $(patsubst %.c, %.c.o, $(shell find $(SRCDIR) -name "*.c")))

COMPILE_FLAGS := -bt=dos -w3 -zq -d+ -2 -ox -mc
CXX_FLAGS := $(COMPILE_FLAGS) -xs
C_FLAGS := $(COMPILE_FLAGS) -za99
LINK_FLAGS := -bdos -mcmodel=c

$(TARGET): $(SOURCES_CPP) $(SOURCES_C)
	$(LINK) $(LINK_FLAGS) $(SOURCES_CPP) $(SOURCES_C) -o $(TARGET)

$(DSTDIR)/%.cpp.o: %.cpp Makefile
	$(CXX) $< -fo=$@ -c -cc++ $(CXX_FLAGS) -i=$(INCLUDE):$(EXTRA_INCLUDES)

$(DSTDIR)/%.c.o: %.c Makefile
	$(CC) $< -fo=$@ -c -cc $(C_FLAGS) -i=$(INCLUDE):$(EXTRA_INCLUDES)

clean:
	rm -f $(TARGET) $(SOURCES_CPP) $(SOURCES_C)

export PATH := $(WATCOM)/$(WATCOM_PREFIX):$(PATH)
