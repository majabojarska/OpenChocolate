// Decompile flash read/write/mode-change packets + handshake.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpFlashPackets extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] names = {
            "_ZN11CUSBConnect23make_flash_write_packetEPh10EFlashTypejPKhj",
            "_ZN11CUSBConnect22make_flash_read_packetEPh10EFlashTypejj",
            "_ZN11CUSBConnect23make_mode_change_packetEPh",
            "_ZN11CUSBConnect24send_mode_change_requestEv",
            "_ZN11CUSBConnect16handshake_simpleEj",
            "_ZN11CUSBConnect18send_query_requestE9EQueryCmd",
            "_ZN11CUSBConnect17make_query_packetEPh9EQueryCmd",
            "_ZN11CUSBConnect15send_free_sysexEPKhj"
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
                    Symbol cand = all.next();
                    if (cand.getName().contains(n)) { s = cand; break; }
                }
            }
            if (s == null) { println("NOT FOUND: " + n); continue; }
            Function f = getFunctionContaining(s.getAddress());
            if (f == null) f = getFunctionAt(s.getAddress());
            if (f == null) { println("NO FUNC: " + n); continue; }
            DecompileResults res = di.decompileFunction(f, 120, monitor);
            println("=== " + n + " @ " + f.getEntryPoint());
            println(res.getDecompiledFunction() != null ? res.getDecompiledFunction().getC() : "decompile failed");
        }
        di.dispose();
    }
}
