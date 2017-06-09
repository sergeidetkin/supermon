SOURCES := main.cpp monitor.cpp
TARGET := monitor_test

build.type ?= debug
build.dir = build/$(build.type)

boost.dir := $(HOME)/src/boost-1.65
boost.dir.lib := $(boost.dir)/bin.v2/libs
boost.dir.include := $(boost.dir)

boost.libs := system

beast.dir := $(HOME)/src/Beast
beast.dir.include := $(beast.dir)/include

CXX ?= g++
CXXFLAGS += -std=c++1y -g -O0
CPPFLAGS += -isystem$(boost.dir.include) -isystem$(beast.dir.include)
DEPFLAGS = -MMD -MP -MT $@ -MF $(basename $@).d
LDFLAGS += -g -L$(boost.dir.lib)

LIBS := $(foreach lib,$(boost.libs),-lboost_$(lib))

%.d :;

$(build.dir)/%.o : %.cpp
	@mkdir -p $(@D)
	$(CXX) $(CXXFLAGS) $(CPPFLAGS) $(DEPFLAGS) -o $@ -c $<

$(TARGET) : $(foreach OBJ,$(SOURCES:cpp=o),$(build.dir)/$(OBJ))
	$(CXX) $(LDFLAGS) $^ $(LIBS) -o $@

all: $(TARGET)

