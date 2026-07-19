using System;
using System.Diagnostics;
using System.IO;

// Tiny launcher: double-clicking this .exe opens uninstall.bat in a
// normal console window, in this .exe's own folder. All the real logic
// (finding running bot processes, removing node_modules/.env) lives in
// that batch file and scripts/uninstall.js.
class UninstallLauncher
{
    static int Main()
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        string batPath = Path.Combine(exeDir, "uninstall.bat");

        if (!File.Exists(batPath))
        {
            Console.WriteLine("uninstall.bat was not found next to this program.");
            Console.WriteLine("Expected it at: " + batPath);
            Console.WriteLine("Press any key to exit...");
            Console.ReadKey();
            return 1;
        }

        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c \"" + batPath + "\"",
            WorkingDirectory = exeDir,
            UseShellExecute = true,
        };

        Process.Start(psi);
        return 0;
    }
}
