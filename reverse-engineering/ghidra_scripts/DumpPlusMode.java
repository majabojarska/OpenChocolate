// Decompile FootCtrlPlusDlg::checkedMode + updateGroupMaxBank + checkedInterfaceType.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpPlusMode extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] names = {
            "__ZN15FootCtrlPlusDlg11checkedModeEv",
            "__ZN15FootCtrlPlusDlg18updateGroupMaxBankEv",
            "__ZN15FootCtrlPlusDlg20checkedInterfaceTypeEv",
            "__ZN15FootCtrlPlusDlg16sendDataToDeviceEjPKhjP7QObject"
        };
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        for (String n : names) {
            SymbolIterator it = currentProgram.getSymbolTable().getSymbols(n);
            Symbol s = null;
            if (it.hasNext()) s = it.next();
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
