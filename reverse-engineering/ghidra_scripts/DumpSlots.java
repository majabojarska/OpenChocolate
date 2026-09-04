// Decompile checkedFootSwitchMode + checkedFootSwitch (PC modes wiring, bankMax writes).
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpSlots extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] frags = {
            "checkedFootSwitchMode",
            "checkedFootSwitch",
            "checkedInterfaceType",
            "comBoxChange",
            "checkedMode"
        };
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        SymbolTable st = currentProgram.getSymbolTable();
        SymbolIterator all = st.getAllSymbols(true);
        java.util.List<Symbol> found = new java.util.ArrayList<>();
        while (all.hasNext()) {
            Symbol c = all.next();
            String n = c.getName();
            if (!n.startsWith("_ZN12CFootCtrlDlg")) continue;
            for (String f : frags) {
                if (n.contains(f)) { found.add(c); break; }
            }
        }
        println("FOUND " + found.size() + " symbols");
        for (Symbol s : found) {
            Function fn = getFunctionContaining(s.getAddress());
            if (fn == null) fn = getFunctionAt(s.getAddress());
            if (fn == null) continue;
            DecompileResults res = di.decompileFunction(fn, 120, monitor);
            println("=== " + s.getName() + " @ " + fn.getEntryPoint());
            println(res.getDecompiledFunction() != null ? res.getDecompiledFunction().getC() : "fail");
        }
        di.dispose();
    }
}
