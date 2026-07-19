using System;
using System.Diagnostics;
using System.IO;

// Tiny launcher: double-clicking this .exe opens install-and-start.bat in
// a normal console window, in this .exe's own folder. All the real logic
// (checking for Node.js, npm install, the setup wizard, npm start) lives
// in that batch file - this program only exists so there's a literal
// double-clickable .exe with no console-flag/PowerShell-execution-policy
// friction for the user.
class Launcher
{
    static int Main()
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        string batPath = Path.Combine(exeDir, "install-and-start.bat");

        if (!File.Exists(batPath))
        {
            Console.WriteLine("install-and-start.bat was not found next to this program.");
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
