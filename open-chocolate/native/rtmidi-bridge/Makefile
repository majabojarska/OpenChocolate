# Builds the rtmidi-bridge: the stdio glue around the vendored RtMidi
# (native/rtmidi). Requires a C++17 compiler and ALSA development headers
# (libasound2-dev on Debian/Ubuntu; the same stack Chromium's Web MIDI uses).
#
#   make          build native/rtmidi-bridge/bin/rtmidi-bridge
#   make clean    remove the build output

CXX      ?= g++
# -D__LINUX_ALSA__: RtMidi 6.x does not auto-detect the backend; CMake
# normally injects this define, so a bare g++ build must pass it explicitly.
CXXFLAGS ?= -std=c++17 -O2 -Wall -D__LINUX_ALSA__
RTMIDI   := ../rtmidi
SOURCES  := main.cpp $(RTMIDI)/RtMidi.cpp
INCLUDES := -I$(RTMIDI)
# RtMidi's ALSA backend; -pthread for the input poller thread.
LIBS     := -lasound -lpthread
BIN      := bin/rtmidi-bridge

all: $(BIN)

$(BIN): $(SOURCES) $(RTMIDI)/RtMidi.h
	@mkdir -p bin
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $@ $(SOURCES) $(LIBS)

clean:
	rm -rf bin

.PHONY: all clean