// Find xrefs to _s_arrSysexHead and show which functions use it; also dump CMIDITranfer::write_sysex.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpHead extends GhidraScript {
    @Override
    public void run() throws Exception {
        // 1. find the symbol
        Symbol sym = null;
        SymbolIterator all = currentProgram.getSymbolTable().getAllSymbols(true);
        while (all.hasNext()) {
            Symbol c = all.next();
            if (c.getName().contains("s_arrSysexHead")) { sym = c; break; }
        }
        if (sym == null) { println("head symbol not found"); return; }
        println("head @ " + sym.getAddress());
        byte[] bytes = getBytes(sym.getAddress(), 16);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) sb.append(String.format("%02x ", b));
        println("bytes: " + sb);

        // 2. xrefs
        ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(sym.getAddress());
        int count = 0;
        while (refs.hasNext() && count < 30) {
            Reference r = refs.next();
            Function f = getFunctionContaining(r.getFromAddress());
            println("ref from " + r.getFromAddress() + " in " + (f != null ? f.getName() : "?"));
            count++;
        }

        // 3. dump CMIDITranfer::write_sysex
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        SymbolIterator it = currentProgram.getSymbolTable().getSymbols("_ZN12CMIDITranfer11write_sysexEPKhj");
        Symbol ws = null;
        if (it.hasNext()) ws = it.next();
        if (ws == null) {
            SymbolIterator all2 = currentProgram.getSymbolTable().getAllSymbols(true);
            while (all2.hasNext()) {
                Symbol c = all2.next();
                if (c.getName().contains("write_sysex")) { ws = c; break; }
            }
        }
        if (ws != null) {
            Function f = getFunctionContaining(ws.getAddress());
            if (f != null) {
                DecompileResults res = di.decompileFunction(f, 60, monitor);
                println("=== write_sysex @ " + f.getEntryPoint());
                println(res.getDecompiledFunction() != null ? res.getDecompiledFunction().getC() : "fail");
            }
        } else {
            println("write_sysex not found");
        }
        di.dispose();
    }
}
