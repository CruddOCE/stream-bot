using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Windows.Forms;

// Dashboard-style control panel: start/stop the bot, watch live chat with
// per-user coloring, see an activity log, connect OBS, and self-update.
// Closing the window stops the bot if it's running, so there's no
// separate "turn it off" step to remember after a stream.
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

// Centralized dark palette so every control matches.
static class Theme
{
    public static readonly Color Background = Color.FromArgb(24, 24, 27);
    public static readonly Color Panel = Color.FromArgb(32, 32, 36);
    public static readonly Color Header = Color.FromArgb(18, 18, 20);
    public static readonly Color Border = Color.FromArgb(50, 50, 55);
    public static readonly Color Text = Color.FromArgb(230, 230, 235);
    public static readonly Color MutedText = Color.FromArgb(150, 150, 160);
    public static readonly Color Accent = Color.FromArgb(145, 70, 255);
    public static readonly Color AccentDark = Color.FromArgb(105, 50, 190);
    public static readonly Color Running = Color.FromArgb(87, 242, 135);
    public static readonly Color Stopped = Color.FromArgb(255, 92, 92);
    public static readonly Color Secondary = Color.FromArgb(55, 55, 62);

    public static Font Title = new Font("Segoe UI", 14, FontStyle.Bold);
    public static Font Body = new Font("Segoe UI", 9.5F);
    public static Font BodyBold = new Font("Segoe UI", 9.5F, FontStyle.Bold);
    public static Font Small = new Font("Segoe UI", 8.5F);
    public static Font Mono = new Font("Consolas", 9F);

    public static Button MakeButton(string text, Color back, Color fore)
    {
        var b = new Button
        {
            Text = text,
            FlatStyle = FlatStyle.Flat,
            BackColor = back,
            ForeColor = fore,
            Font = BodyBold,
            Cursor = Cursors.Hand,
        };
        b.FlatAppearance.BorderSize = 0;
        return b;
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
    private RichTextBox chatBox;
    private RichTextBox logBox;
    private readonly Dictionary<string, Color> userColors = new Dictionary<string, Color>();

    private static readonly Color[] UserPalette = new[]
    {
        Color.FromArgb(255, 129, 122), Color.FromArgb(122, 190, 255), Color.FromArgb(255, 200, 110),
        Color.FromArgb(150, 235, 160), Color.FromArgb(255, 150, 225), Color.FromArgb(140, 225, 225),
        Color.FromArgb(205, 175, 255), Color.FromArgb(255, 225, 130), Color.FromArgb(180, 255, 180),
        Color.FromArgb(255, 175, 210),
    };

    public MainForm()
    {
        rootDir = AppDomain.CurrentDomain.BaseDirectory;

        Text = "stream-bot";
        Width = 900;
        Height = 560;
        MinimumSize = new Size(700, 420);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Theme.Background;
        Font = Theme.Body;
        FormClosing += OnFormClosing;

        Controls.Add(BuildBottomBar());
        Controls.Add(BuildMainSplit());
        Controls.Add(BuildHeader());

        AppendLog("stream-bot control ready.");
        CheckReadiness();
    }

    // ---------- Layout ----------

    private Panel BuildHeader()
    {
        var header = new Panel { Dock = DockStyle.Top, Height = 64, BackColor = Theme.Header };

        var title = new Label
        {
            Text = "stream-bot",
            Font = Theme.Title,
            ForeColor = Theme.Text,
            AutoSize = true,
            Location = new Point(16, 16),
        };

        statusLabel = new Label
        {
            Text = "STOPPED",
            Font = Theme.BodyBold,
            ForeColor = Theme.Stopped,
            AutoSize = true,
            Anchor = AnchorStyles.Top | AnchorStyles.Right,
        };

        toggleButton = Theme.MakeButton("Start Bot", Theme.Accent, Color.White);
        toggleButton.Size = new Size(120, 34);
        toggleButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        toggleButton.Click += OnToggleClick;

        header.Controls.Add(title);
        header.Controls.Add(statusLabel);
        header.Controls.Add(toggleButton);

        Action positionRightSide = () =>
        {
            toggleButton.Location = new Point(header.ClientSize.Width - toggleButton.Width - 16, 15);
            statusLabel.Location = new Point(toggleButton.Left - statusLabel.Width - 16, 24);
        };
        header.Resize += (s, e) => positionRightSide();
        positionRightSide();

        return header;
    }

    private SplitContainer BuildMainSplit()
    {
        var split = new SplitContainer
        {
            Dock = DockStyle.Fill,
            BackColor = Theme.Border,
            SplitterWidth = 2,
        };

        split.Panel1.Controls.Add(BuildFeedPanel("LIVE CHAT", out chatBox, true));
        split.Panel2.Controls.Add(BuildFeedPanel("ACTIVITY LOG", out logBox, false));
        split.Panel1.BackColor = Theme.Background;
        split.Panel2.BackColor = Theme.Background;

        // 65/35 split, set once the control has a real width.
        split.HandleCreated += (s, e) =>
        {
            try { split.SplitterDistance = (int)(split.Width * 0.62); }
            catch { /* width not settled yet on some resizes; harmless to skip */ }
        };

        return split;
    }

    private Panel BuildFeedPanel(string headerText, out RichTextBox box, bool isChat)
    {
        var panel = new Panel { Dock = DockStyle.Fill, BackColor = Theme.Background, Padding = new Padding(10, 8, 10, 10) };

        var header = new Label
        {
            Text = headerText,
            Font = Theme.Small,
            ForeColor = Theme.MutedText,
            Dock = DockStyle.Top,
            Height = 22,
        };

        var rtb = new RichTextBox
        {
            Dock = DockStyle.Fill,
            ReadOnly = true,
            BorderStyle = BorderStyle.None,
            BackColor = Theme.Panel,
            ForeColor = Theme.Text,
            Font = isChat ? Theme.Body : Theme.Mono,
        };

        panel.Controls.Add(rtb);
        panel.Controls.Add(header);
        box = rtb;
        return panel;
    }

    private Panel BuildBottomBar()
    {
        var bar = new Panel { Dock = DockStyle.Bottom, Height = 52, BackColor = Theme.Header };

        var obsLabel = new Label
        {
            Text = "OBS password:",
            ForeColor = Theme.MutedText,
            Font = Theme.Small,
            Location = new Point(16, 19),
            AutoSize = true,
        };
        obsPasswordBox = new TextBox
        {
            Location = new Point(105, 15),
            Width = 130,
            PasswordChar = '*',
            BackColor = Theme.Secondary,
            ForeColor = Theme.Text,
            BorderStyle = BorderStyle.FixedSingle,
        };
        obsButton = Theme.MakeButton("Add OBS Browser Source", Theme.Secondary, Theme.Text);
        obsButton.Location = new Point(245, 11);
        obsButton.Size = new Size(190, 30);
        obsButton.Click += OnObsButtonClick;

        updateButton = Theme.MakeButton("Update", Theme.Secondary, Theme.Text);
        updateButton.Size = new Size(90, 30);
        updateButton.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        updateButton.Click += OnUpdateButtonClick;

        bar.Controls.Add(obsLabel);
        bar.Controls.Add(obsPasswordBox);
        bar.Controls.Add(obsButton);
        bar.Controls.Add(updateButton);

        bar.Resize += (s, e) => { updateButton.Location = new Point(bar.ClientSize.Width - updateButton.Width - 16, 11); };

        return bar;
    }

    // ---------- Readiness ----------

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

    // ---------- Start / stop ----------

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
            botProcess.OutputDataReceived += (s, ev) => { if (ev.Data != null) HandleBotOutputLine(ev.Data); };
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
        statusLabel.Text = "RUNNING";
        statusLabel.ForeColor = Theme.Running;
        toggleButton.Text = "Stop Bot";
        toggleButton.BackColor = Theme.Stopped;
    }

    private void SetStopped()
    {
        statusLabel.Text = "STOPPED";
        statusLabel.ForeColor = Theme.Stopped;
        toggleButton.Text = "Start Bot";
        toggleButton.BackColor = Theme.Accent;
    }

    // ---------- OBS / Update ----------

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

    // ---------- Output routing ----------

    private const string ChatPrefix = "@@CHAT@@|";

    private void HandleBotOutputLine(string line)
    {
        if (line.StartsWith(ChatPrefix, StringComparison.Ordinal)) AppendChatThreadSafe(line);
        else AppendLogThreadSafe(line);
    }

    // ---------- Log panel ----------

    private void AppendLog(string line)
    {
        logBox.AppendText(line + Environment.NewLine);
        logBox.SelectionStart = logBox.TextLength;
        logBox.ScrollToCaret();
        TrimIfTooLong(logBox);
    }

    private void AppendLogThreadSafe(string line)
    {
        if (logBox.InvokeRequired) logBox.BeginInvoke(new Action(() => AppendLog(line)));
        else AppendLog(line);
    }

    // ---------- Chat panel ----------

    private void AppendChatThreadSafe(string rawLine)
    {
        if (chatBox.InvokeRequired) chatBox.BeginInvoke(new Action(() => AppendChat(rawLine)));
        else AppendChat(rawLine);
    }

    private void AppendChat(string rawLine)
    {
        // Format: @@CHAT@@|platform|base64(username)|isMod(0/1)|isBroadcaster(0/1)|base64(text)
        string[] parts = rawLine.Substring(ChatPrefix.Length).Split('|');
        if (parts.Length < 5) return;

        string platform = parts[0];
        string username = DecodeBase64(parts[1]);
        bool isMod = parts[2] == "1";
        bool isBroadcaster = parts[3] == "1";
        string text = DecodeBase64(parts[4]);

        chatBox.SelectionStart = chatBox.TextLength;
        chatBox.SelectionLength = 0;

        AppendColored(chatBox, DateTime.Now.ToString("HH:mm:ss "), Theme.MutedText, Theme.Small);

        Color platformColor = platform == "twitch" ? Color.FromArgb(169, 112, 255) : Color.FromArgb(255, 90, 90);
        AppendColored(chatBox, "[" + (platform == "twitch" ? "Twitch" : "YouTube") + "] ", platformColor, Theme.Small);

        if (isBroadcaster) AppendColored(chatBox, "[HOST] ", Color.Gold, Theme.Small);
        else if (isMod) AppendColored(chatBox, "[MOD] ", Theme.Running, Theme.Small);

        AppendColored(chatBox, username + ":  ", ColorForUsername(username), Theme.BodyBold);
        AppendColored(chatBox, text + Environment.NewLine, Theme.Text, Theme.Body);

        chatBox.ScrollToCaret();
        TrimIfTooLong(chatBox);
    }

    private void AppendColored(RichTextBox box, string text, Color color, Font font)
    {
        box.SelectionStart = box.TextLength;
        box.SelectionLength = 0;
        box.SelectionColor = color;
        box.SelectionFont = font;
        box.AppendText(text);
    }

    private void TrimIfTooLong(RichTextBox box)
    {
        // Keep memory/render cost bounded over a long stream, without
        // wiping formatting on the text that's kept (Lines-based trimming
        // would lose all coloring, so trim via selection-delete instead).
        const int maxChars = 60000;
        const int keepChars = 45000;
        if (box.TextLength > maxChars)
        {
            box.Select(0, box.TextLength - keepChars);
            box.SelectedText = string.Empty;
        }
    }

    private Color ColorForUsername(string username)
    {
        Color color;
        if (userColors.TryGetValue(username, out color)) return color;
        int hash = 0;
        unchecked
        {
            foreach (char c in username) hash = hash * 31 + c;
        }
        color = UserPalette[Math.Abs(hash) % UserPalette.Length];
        userColors[username] = color;
        return color;
    }

    private string DecodeBase64(string s)
    {
        try
        {
            return Encoding.UTF8.GetString(Convert.FromBase64String(s));
        }
        catch
        {
            return s;
        }
    }

    // ---------- Shutdown ----------

    private void OnFormClosing(object sender, FormClosingEventArgs e)
    {
        if (botProcess != null && !botProcess.HasExited) StopBot();
    }
}
