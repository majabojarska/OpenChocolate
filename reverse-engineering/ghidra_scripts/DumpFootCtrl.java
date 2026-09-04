// Decompile CFootCtrlDlg config functions: initDataByUSB, sendDataToDevice, checkedMode etc.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

public class DumpFootCtrl extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] names = {
            "_ZN12CFootCtrlDlg13initDataByUSBEv",
            "_ZN12CFootCtrlDlg16sendDataToDeviceEjPKhjP7QObject",
            "_ZN12CFootCtrlDlg11checkedModeEv",
            "_ZN12CFootCtrlDlg21checkedFootSwitchTypeEv",
            "_ZN12CFootCtrlDlg14bankARemoveAllEv",
            "_ZN12CFootCtrlDlg12addAMidiCodeEv",
            "_ZN12CFootCtrlDlg4initEv"
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
            DecompileResults res = di.decompileFunction(f, 120, monitor);
            println("=== " + n + " @ " + f.getEntryPoint());
            println(res.getDecompiledFunction() != null ? res.getDecompiledFunction().getC() : "decompile failed");
        }
        di.dispose();
    }
}
