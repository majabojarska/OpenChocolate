// rtmidi-bridge: a minimal MIDI bridge around RtMidi.
//
// RtMidi is a single-file C++ library (MIT, vendored in ../rtmidi). This
// program is the thinnest possible glue around it: it opens ALSA MIDI ports
// (same sequencer backend Chromium's Web MIDI uses) and speaks newline-
// delimited JSON-lines over stdin/stdout, so Node.js can use it without any
// native addon / node-gyp machinery.
//
// Protocol (one line per message):
//
//   node -> bridge (stdin):
//     list                       enumerate available ports
//     open in|out <index>        open a port by index
//     close in|out <index>       close a port
//     send <outIndex> <b...>     send raw MIDI bytes out of a port
//     quit                       exit cleanly
//
//   bridge -> node (stdout):
//     {"type":"ready"}
//     {"type":"list","inputs":[{"index":N,"name":"..."}],"outputs":[...]}
//     {"type":"open","dir":"in|out","index":N}
//     {"type":"close","dir":"in|out","index":N}
//     {"type":"sent","index":N,"count":K}
//     {"type":"msg","index":N,"bytes":[...]}     input message from port N
//     {"type":"error","message":"..."}
//
// Diagnostics go to stderr and never touch the protocol stream.

#include <RtMidi.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdio>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace {

std::mutex g_out;              // guards stdout writes (main + poller threads)
std::atomic<bool> g_stop{false};
std::once_flag g_pollerOnce;
std::thread g_poller;

struct InputPort {
  int index;
  std::string name;
  std::unique_ptr<RtMidiIn> midi;
};
struct OutputPort {
  int index;
  std::string name;
  std::unique_ptr<RtMidiOut> midi;
};

// Owned by whichever thread mutates/reads them; the poller holds this mutex
// while draining input queues, open/close/send/list take it too.
std::mutex g_ports;
std::vector<InputPort> g_inputs;
std::vector<OutputPort> g_outputs;

void printLine(const std::string& line) {
  std::lock_guard<std::mutex> lock(g_out);
  std::cout << line << '\n' << std::flush;
}

std::string jsonStr(const std::string& s) {
  std::string out = "\"";
  char buf[8];
  for (unsigned char c : s) {
    switch (c) {
      case '"':
        out += "\\\"";
        break;
      case '\\':
        out += "\\\\";
        break;
      case '\n':
        out += "\\n";
        break;
      case '\r':
        out += "\\r";
        break;
      case '\t':
        out += "\\t";
        break;
      default:
        if (c < 0x20) {
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out + "\"";
}

void printError(const std::string& message) {
  printLine("{\"type\":\"error\",\"message\":" + jsonStr(message) + "}");
}

void printError(RtMidiError& e) {
  printError(e.getMessage());
}
/** Background thread: drain queued messages from every open input port. */
void inputPoller() {
  for (;;) {
    if (g_stop.load()) return;
    {
      std::lock_guard<std::mutex> lock(g_ports);
      for (const auto& in : g_inputs) {
        if (!in.midi) continue;
        std::vector<unsigned char> msg;
        for (;;) {
          msg.clear();
          in.midi->getMessage(&msg);
          if (msg.empty()) break;
          std::ostringstream line;
          line << "{\"type\":\"msg\",\"index\":" << in.index << ",\"bytes\":[";
          for (size_t i = 0; i < msg.size(); i++) {
            if (i) line << ',';
            line << static_cast<int>(msg[i]);
          }
          line << "]}";
          printLine(line.str());
        }
      }
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(2));
  }
}

void ensurePoller() {
  std::call_once(g_pollerOnce, [] { g_poller = std::thread(inputPoller); });
}

template <typename T>
std::string portsJson() {
  T probe;
  std::ostringstream out;
  const unsigned int count = probe.getPortCount();
  for (unsigned int i = 0; i < count; i++) {
    if (i) out << ',';
    out << "{\"index\":" << i << ",\"name\":" << jsonStr(probe.getPortName(i)) << '}';
  }
  return out.str();
}

void cmdList() {
  std::lock_guard<std::mutex> lock(g_ports);
  try {
    printLine("{\"type\":\"list\",\"inputs\":[" + portsJson<RtMidiIn>() +
              "],\"outputs\":[" + portsJson<RtMidiOut>() + "]}");
  } catch (RtMidiError& e) {
    printError(e);
  }
}

void cmdOpen(std::istringstream& args) {
  std::string dir;
  int index = -1;
  if (!(args >> dir >> index) || index < 0) {
    printError("usage: open in|out <index>");
    return;
  }
  std::lock_guard<std::mutex> lock(g_ports);
  try {
    if (dir == "in") {
      for (const auto& p : g_inputs) {
        if (p.index == index) {
          printLine("{\"type\":\"open\",\"dir\":\"in\",\"index\":" + std::to_string(index) + "}");
          return; // already open - idempotent
        }
      }
      RtMidiIn probe;
      if (static_cast<unsigned int>(index) >= probe.getPortCount()) {
        printError("no such input port: " + std::to_string(index));
        return;
      }
      auto midi = std::make_unique<RtMidiIn>();
      midi->openPort(static_cast<unsigned int>(index), "open-chocolate");
      // RtMidi ignores SysEx / timing / active-sensing by default; we need
      // SysEx (and everything else) for protocol capture.
      midi->ignoreTypes(false, false, false);
      g_inputs.push_back(
          {index, midi->getPortName(static_cast<unsigned int>(index)), std::move(midi)});
    } else if (dir == "out") {
      for (const auto& p : g_outputs) {
        if (p.index == index) {
          printLine("{\"type\":\"open\",\"dir\":\"out\",\"index\":" + std::to_string(index) + "}");
          return; // already open - idempotent
        }
      }
      RtMidiOut probe;
      if (static_cast<unsigned int>(index) >= probe.getPortCount()) {
        printError("no such output port: " + std::to_string(index));
        return;
      }
      auto midi = std::make_unique<RtMidiOut>();
      midi->openPort(static_cast<unsigned int>(index), "open-chocolate");
      g_outputs.push_back(
          {index, midi->getPortName(static_cast<unsigned int>(index)), std::move(midi)});
    } else {
      printError("usage: open in|out <index>");
      return;
    }
    printLine("{\"type\":\"open\",\"dir\":" + jsonStr(dir) + ",\"index\":" + std::to_string(index) + "}");
    if (dir == "in") ensurePoller();
  } catch (RtMidiError& e) {
    printError(e);
  }
}

void cmdClose(std::istringstream& args) {
  std::string dir;
  int index = -1;
  if (!(args >> dir >> index) || index < 0) {
    printError("usage: close in|out <index>");
    return;
  }
  std::lock_guard<std::mutex> lock(g_ports);
  if (dir == "in") {
    g_inputs.erase(
        std::remove_if(g_inputs.begin(), g_inputs.end(),
                       [index](const InputPort& p) { return p.index == index; }),
        g_inputs.end());
  } else if (dir == "out") {
    g_outputs.erase(
        std::remove_if(g_outputs.begin(), g_outputs.end(),
                       [index](const OutputPort& p) { return p.index == index; }),
        g_outputs.end());
  } else {
    printError("usage: close in|out <index>");
    return;
  }
  printLine("{\"type\":\"close\",\"dir\":" + jsonStr(dir) + ",\"index\":" + std::to_string(index) + "}");
}

void cmdSend(std::istringstream& args) {
  int index = -1;
  if (!(args >> index) || index < 0) {
    printError("usage: send <outIndex> <byte...>");
    return;
  }
  std::vector<unsigned char> msg;
  int b;
  while (args >> b) {
    if (b < 0 || b > 255) {
      printError("byte out of range: " + std::to_string(b));
      return;
    }
    msg.push_back(static_cast<unsigned char>(b));
  }
  std::lock_guard<std::mutex> lock(g_ports);
  try {
    for (const auto& out : g_outputs) {
      if (out.index == index) {
        out.midi->sendMessage(&msg);
        printLine("{\"type\":\"sent\",\"index\":" + std::to_string(index) +
                  ",\"count\":" + std::to_string(msg.size()) + "}");
        return;
      }
    }
    printError("output port not open: " + std::to_string(index));
  } catch (RtMidiError& e) {
    printError(e);
  }
}

}  // namespace

int main() {
  printLine("{\"type\":\"ready\"}");
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream args(line);
    std::string cmd;
    if (!(args >> cmd)) continue;
    if (cmd == "quit") break;
    if (cmd == "list") cmdList();
    else if (cmd == "open") cmdOpen(args);
    else if (cmd == "close") cmdClose(args);
    else if (cmd == "send") cmdSend(args);
    else printError("unknown command: " + cmd);
  }
  g_stop.store(true);
  if (g_poller.joinable()) g_poller.join();
  return 0;
}