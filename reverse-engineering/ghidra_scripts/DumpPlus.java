// Dump FootCtrlPlusDlg functions: checkedFootSwitchMode, checkedFootSwitch, checkedMode, etc.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpPlus extends GhidraScript {
    @Override
    public void run() throws Exception {
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        SymbolIterator all = currentProgram.getSymbolTable().getAllSymbols(true);
        java.util.List<Symbol> found = new java.util.ArrayList<>();
        while (all.hasNext()) {
            Symbol c = all.next();
            String n = c.getName();
            if (n.contains("FootCtrlPlusDlg") || n.contains("15FootCtrlPlus")) found.add(c);
        }
        println("PLUS SYMBOLS: " + found.size());
        for (Symbol s : found) {
            Function fn = getFunctionContaining(s.getAddress());
            if (fn == null) fn = getFunctionAt(s.getAddress());
            if (fn == null) { println("NO FUNC: " + s.getName()); continue; }
            DecompileResults res = di.decompileFunction(fn, 120, monitor);
            println("=== " + s.getName() + " @ " + fn.getEntryPoint());
            println(res.getDecompiledFunction() != null ? res.getDecompiledFunction().getC() : "fail");
        }
        di.dispose();
    }
}
