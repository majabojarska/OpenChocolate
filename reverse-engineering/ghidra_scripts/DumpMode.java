// Dump set_system_mode and make_mode_change_packet together.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpMode extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] names = {
            "_ZN11CUSBConnect15set_system_modeE11ESystemMode",
            "_ZN11CUSBConnect23make_mode_change_packetEPh",
            "_ZN11CUSBConnect24send_mode_change_requestEv"
        };
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        SymbolTable st = currentProgram.getSymbolTable();
        for (String n : names) {
            SymbolIterator it = st.getSymbols(n);
            Symbol s = null;
            if (it.hasNext()) s = it.next();
            if (s == null) {
                SymbolIterator all = st.getAllSymbols(true);
                while (all.hasNext()) {
                    Symbol c = all.next();
                    if (c.getName().contains(n)) { s = c; break; }
                }
            }
            if (s == null) { println("NOT FOUND: " + n); continue; }
            Function f = getFunctionContaining(s.getAddress());
            if (f == null) f = getFunctionAt(s.getAddress());
            DecompileResults res = di.decompileFunction(f, 120, monitor);
            println("=== " + n + " @ " + f.getEntryPoint());
            println(res.getDecompiledFunction() != null ? res.getDecompiledFunction().getC() : "fail");
        }
        di.dispose();
    }
}
