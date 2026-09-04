// Decompile selected CUSBConnect checksum/mode functions by symbol name.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpChecksum extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] names = {
            "_ZN11CUSBConnect12add_checksumERPhS0_j",
            "_ZN11CUSBConnect15verify_checksumEPhjh",
            "_ZN11CUSBConnect17make_query_packetEPh9EQueryCmd",
            "_ZN11CUSBConnect13send_free_cmdEhhh",
            "_ZN11CUSBConnect15send_free_sysexEPKhj",
            "_ZN11CUSBConnect23make_mode_change_packetEPh",
            "_ZN11CUSBConnect24send_mode_change_requestEv",
            "_ZN11CUSBConnect16handshake_simpleEj",
            "_ZN11CUSBConnect20make_responds_packetEPhb"
        };
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        SymbolTable st = currentProgram.getSymbolTable();
        for (String n : names) {
            // Try exact, then mangled-with-leading-underscore, then substring.
            SymbolIterator it = st.getSymbols(n);
            Symbol s = null;
            if (it.hasNext()) s = it.next();
            if (s == null) {
                it = st.getSymbols("_" + n);
                if (it.hasNext()) s = it.next();
            }
            if (s == null) {
                SymbolIterator all = st.getAllSymbols(true);
                while (all.hasNext()) {
                    Symbol cand = all.next();
                    if (cand.getName().contains(n)) { s = cand; break; }
                }
            }
            if (s == null) {
                println("NOT FOUND: " + n);
                continue;
            }
            Function f = getFunctionContaining(s.getAddress());
            if (f == null) f = getFunctionAt(s.getAddress());
            if (f == null) {
                println("NO FUNC: " + n);
                continue;
            }
            DecompileResults res = di.decompileFunction(f, 60, monitor);
            println("=== " + n + " @ " + f.getEntryPoint());
            println(res.getDecompiledFunction() != null ? res.getDecompiledFunction().getC() : "decompile failed");
        }
        di.dispose();
    }
}
