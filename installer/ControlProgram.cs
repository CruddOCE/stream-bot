using System;
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
