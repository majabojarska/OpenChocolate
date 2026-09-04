// List all CFootCtrlDlg symbols to learn exact names.
import ghidra.app.script.GhidraScript;
import ghidra.program.model.symbol.*;

public class ListSymbols extends GhidraScript {
    @Override
    public void run() throws Exception {
        SymbolIterator all = currentProgram.getSymbolTable().getAllSymbols(true);
        int count = 0;
        while (all.hasNext()) {
            Symbol c = all.next();
            String n = c.getName();
            if (n.contains("CFootCtrlDlg") || n.contains("checkedFootSwitch")) {
                println(n);
                count++;
                if (count > 100) break;
            }
        }
        println("total " + count);
    }
}
