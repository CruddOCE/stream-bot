using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

// Simple on/off control panel: one button to start the bot, the same
// button to stop it, a status indicator, and a live log. Closing the
// window stops the bot if it's running, so there's no separate "turn it
// off" step to remember after a stream.
class ControlApp
{
    [STAThread]
    static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}

class MainForm : Form
{
    private readonly string rootDir;
    private Process botProcess;
    private Button toggleButton;
    private Button obsButton;
    private Button updateButton;
    private TextBox obsPasswordBox;
    private Label statusLabel;
    private TextBox logBox;

    public MainForm()
    {
        rootDir = AppDomain.CurrentDomain.BaseDirectory;

        Text = "stream-bot control";
        Width = 640;
        Height = 420;
        StartPosition = FormStartPosition.CenterScreen;
        FormClosing += OnFormClosing;

        statusLabel = new Label
        {
            Text = "Status: stopped",
            Dock = DockStyle.Top,
            Height = 32,
            TextAlign = ContentAlignment.MiddleLeft,
            Padding = new Padding(8, 0, 0, 0),
            Font = new Font(Font.FontFamily, 11, FontStyle.Bold),
            ForeColor = Color.DarkRed,
        };

        toggleButton = new Button
        {
            Text = "Start Bot",
            Dock = DockStyle.Top,
            Height = 44,
            Font = new Font(Font.FontFamily, 11),
        };
        toggleButton.Click += OnToggleClick;

        var actionsPanel = new Panel { Dock = DockStyle.Top, Height = 40 };

        var obsPasswordLabel = new Label
        {
            Text = "OBS pwd:",
            Location = new Point(4, 11),
            Width = 55,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        obsPasswordBox = new TextBox { Location = new Point(60, 8), Width = 110, PasswordChar = '*' };
        obsButton = new Button { Text = "Add OBS Browser Source", Location = new Point(178, 5), Width = 170, Height = 28 };
        obsButton.Click += OnObsButtonClick;
        updateButton = new Button { Text = "Update", Location = new Point(354, 5), Width = 80, Height = 28 };
        updateButton.Click += OnUpdateButtonClick;

        actionsPanel.Controls.Add(obsPasswordLabel);
        actionsPanel.Controls.Add(obsPasswordBox);
        actionsPanel.Controls.Add(obsButton);
        actionsPanel.Controls.Add(updateButton);

        logBox = new TextBox
        {
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            Dock = DockStyle.Fill,
            Font = new Font(FontFamily.GenericMonospace, 9),
            BackColor = Color.Black,
            ForeColor = Color.LightGray,
        };

        Controls.Add(logBox);
        Controls.Add(actionsPanel);
        Controls.Add(toggleButton);
        Controls.Add(statusLabel);

        AppendLog("stream-bot control ready.");
        CheckReadiness();
    }

    private void CheckReadiness()
    {
        bool hasEnv = File.Exists(Path.Combine(rootDir, ".env"));
        bool hasModules = Directory.Exists(Path.Combine(rootDir, "node_modules"));
        if (!hasEnv || !hasModules)
        {
            string missing = (!hasModules ? "node_modules " : "") + (!hasEnv ? ".env" : "");
            AppendLog("Setup looks incomplete (missing " + missing.Trim() + ").");
            AppendLog("Run install-stream-bot.exe first, then reopen this.");
        }
    }

    private string ResolveNodePath()
    {
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string pfx86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string[] candidates = { Path.Combine(pf, "nodejs", "node.exe"), Path.Combine(pfx86, "nodejs", "node.exe") };
        foreach (var c in candidates)
        {
            if (File.Exists(c)) return c;
        }
        return "node.exe"; // fall back to PATH resolution
    }

    private void OnToggleClick(object sender, EventArgs e)
    {
        if (botProcess == null) StartBot();
        else StopBot();
    }

    private void StartBot()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = ResolveNodePath(),
                Arguments = "index.js",
                WorkingDirectory = rootDir,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };

            botProcess = new Process { StartInfo = psi, EnableRaisingEvents = true };
            botProcess.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLogThreadSafe(ev.Data); };
            botProcess.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLogThreadSafe(ev.Data); };
            botProcess.Exited += (s, ev) =>
            {
                BeginInvoke(new Action(() =>
                {
                    AppendLog("Bot process exited.");
                    SetStopped();
                    botProcess = null;
                }));
            };

            botProcess.Start();
            botProcess.BeginOutputReadLine();
            botProcess.BeginErrorReadLine();

            SetRunning();
            AppendLog("Starting bot...");
        }
        catch (Exception ex)
        {
            AppendLog("Failed to start: " + ex.Message);
            botProcess = null;
        }
    }

    private void StopBot()
    {
        if (botProcess == null) return;
        try
        {
            // Stop the Exited handler from also firing and double-logging --
            // this is an intentional stop, so the message below is enough.
            botProcess.EnableRaisingEvents = false;
            if (!botProcess.HasExited)
            {
                botProcess.Kill();
                botProcess.WaitForExit(5000);
            }
        }
        catch (Exception ex)
        {
            AppendLog("Error stopping bot: " + ex.Message);
        }
        finally
        {
            botProcess = null;
            SetStopped();
            AppendLog("Bot stopped.");
        }
    }

    private void OnObsButtonClick(object sender, EventArgs e)
    {
        var env = new Dictionary<string, string> { { "OBS_WEBSOCKET_PASSWORD", obsPasswordBox.Text } };
        RunNodeScriptOneShot("scripts/addObsSource.js", env, obsButton);
    }

    private void OnUpdateButtonClick(object sender, EventArgs e)
    {
        if (botProcess != null)
        {
            AppendLog("Stop the bot before updating.");
            return;
        }

        AppendLog("This app will close, update, then reopen automatically. A console window will show progress.");

        try
        {
            StartUpdateWatcher();
        }
        catch (Exception ex)
        {
            AppendLog("Failed to start the update: " + ex.Message);
            return;
        }

        Application.Exit();
    }

    // Windows won't let git overwrite an exe file while it's running --
    // including this one. So the update can't run in-process: this spawns
    // a detached watcher that waits for THIS process to fully exit
    // (releasing the file lock), runs the update, then relaunches the
    // control panel.
    private void StartUpdateWatcher()
    {
        string nodeExe = ResolveNodePath();
        string updateScript = Path.Combine(rootDir, "scripts", "update.js");
        string controlExe = Path.Combine(rootDir, "stream-bot-control.exe");
        int myPid = Process.GetCurrentProcess().Id;

        string watcherCommand =
            "powershell -NoProfile -Command \"Wait-Process -Id " + myPid + " -ErrorAction SilentlyContinue\" " +
            "&& \"" + nodeExe + "\" \"" + updateScript + "\" " +
            "& \"" + controlExe + "\"";

        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = "/c " + watcherCommand,
            WorkingDirectory = rootDir,
            UseShellExecute = true,
        };
        Process.Start(psi);
    }

    // Runs a script to completion and streams its output into the log,
    // for one-shot actions (OBS setup, updating) as opposed to the
    // long-running bot process. Disables the triggering button while it
    // runs so it can't be double-clicked mid-flight.
    private void RunNodeScriptOneShot(string relativeScriptPath, Dictionary<string, string> extraEnv, Button triggerButton)
    {
        triggerButton.Enabled = false;
        AppendLog("--- Running " + relativeScriptPath + " ---");

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = ResolveNodePath(),
                Arguments = "\"" + Path.Combine(rootDir, relativeScriptPath) + "\"",
                WorkingDirectory = rootDir,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            if (extraEnv != null)
            {
                foreach (var kv in extraEnv) psi.EnvironmentVariables[kv.Key] = kv.Value;
            }

            var proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
            proc.OutputDataReceived += (s, ev) => { if (ev.Data != null) AppendLogThreadSafe(ev.Data); };
            proc.ErrorDataReceived += (s, ev) => { if (ev.Data != null) AppendLogThreadSafe(ev.Data); };
            proc.Exited += (s, ev) =>
            {
                BeginInvoke(new Action(() =>
                {
                    AppendLog("--- " + relativeScriptPath + " finished (exit code " + proc.ExitCode + ") ---");
                    triggerButton.Enabled = true;
                    proc.Dispose();
                }));
            };

            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
        }
        catch (Exception ex)
        {
            AppendLog("Failed to run " + relativeScriptPath + ": " + ex.Message);
            triggerButton.Enabled = true;
        }
    }

    private void SetRunning()
    {
        statusLabel.Text = "Status: running";
        statusLabel.ForeColor = Color.DarkGreen;
        toggleButton.Text = "Stop Bot";
    }

    private void SetStopped()
    {
        statusLabel.Text = "Status: stopped";
        statusLabel.ForeColor = Color.DarkRed;
        toggleButton.Text = "Start Bot";
    }

    private void AppendLog(string line)
    {
        logBox.AppendText(line + Environment.NewLine);
        logBox.SelectionStart = logBox.TextLength;
        logBox.ScrollToCaret();
    }

    private void AppendLogThreadSafe(string line)
    {
        if (logBox.InvokeRequired) logBox.BeginInvoke(new Action(() => AppendLog(line)));
        else AppendLog(line);
    }

    private void OnFormClosing(object sender, FormClosingEventArgs e)
    {
        if (botProcess != null && !botProcess.HasExited) StopBot();
    }
}
