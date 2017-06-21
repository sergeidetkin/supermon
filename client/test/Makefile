VPATH := ..
SOURCES := main.cpp src/agent.cpp
TARGET := monitor_test

build ?= $(if $(debug),debug,release)
build.dir ?= build/$(build)

boost.dir := $(HOME)/src/boost-1.65
boost.dir.include := $(boost.dir)
boost.dir.lib := $(boost.dir)/bin.v2/libs

boost.libs := program_options system

beast.dir := $(HOME)/src/Beast
beast.dir.include := $(beast.dir)/include

CXX ?= g++
CXXFLAGS += -std=c++1y $(if $(build:debug=),-O3,-g -O0)
CPPFLAGS += -I../include -I$(beast.dir.include) -isystem$(boost.dir.include) 
DEPFLAGS = -MMD -MP -MT $@ -MF $(basename $@).d
LDFLAGS += $(if $(build:debug=),,-g) -L$(boost.dir.lib)

LIBS := $(foreach lib,$(boost.libs),-lboost_$(lib))

%.d :;

$(build.dir)/%.o : %.cpp
	@mkdir -p $(@D)
	$(CXX) $(CXXFLAGS) $(CPPFLAGS) $(DEPFLAGS) -o $@ -c $<

$(build.dir)/$(TARGET) : $(foreach OBJ,$(SOURCES:cpp=o),$(build.dir)/$(OBJ))
	$(CXX) $(LDFLAGS) $^ $(LIBS) -o $@

all: $(TARGET)

