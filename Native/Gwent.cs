using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Threading;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("Gwent Classic for Windows")]
[assembly: System.Reflection.AssemblyProduct("Gwent Classic for Windows")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]

internal sealed class GwentWindow : Form
{
    private readonly WebView2 view = new WebView2();
    private string displayMode;
    private Rectangle windowedBounds;
    private LanLink lanLink;

    public GwentWindow()
    {
        Text = "Gwent | The Witcher 3";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Color.Black;
        MinimumSize = new Size(840, 510);
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1280, 720);
        SetDisplayMode("fullscreen");
        view.DefaultBackgroundColor = Color.Black;
        Controls.Add(view);
        Resize += delegate { FitBoard(); };
        Shown += async delegate {
            try {
                string root = AppDomain.CurrentDomain.BaseDirectory;
                CoreWebView2Environment.SetLoaderDllFolderPath(Path.Combine(root, "Native"));
                var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(root, "Profil"));
                await view.EnsureCoreWebView2Async(environment);
                var web = view.CoreWebView2;
                web.Settings.AreDefaultContextMenusEnabled = false;
                web.Settings.IsStatusBarEnabled = false;
                web.Settings.IsZoomControlEnabled = false;
                web.Settings.AreBrowserAcceleratorKeysEnabled = false;
                web.SetVirtualHostNameToFolderMapping("gwent.local", Path.Combine(root, "Game"), CoreWebView2HostResourceAccessKind.DenyCors);
                web.NewWindowRequested += (sender, e) => { e.Handled = true; };
                web.NavigationStarting += (sender, e) => { e.Cancel = !e.Uri.StartsWith("https://gwent.local/", StringComparison.Ordinal); };
                web.WebMessageReceived += (sender, e) => {
                    if (e.Source != "https://gwent.local/index.html") return;
                    string command = e.TryGetWebMessageAsString();
                    if (command == "exit-game") Close();
                    else if (command.StartsWith("display:")) SetDisplayMode(command.Substring(8));
                    else if (command.StartsWith("cards:")) HandleCards(web, root, command.Substring(6));
                    else if (command.StartsWith("lan:")) HandleLan(web, command.Substring(4));
                };
                FitBoard();
                web.Navigate("https://gwent.local/index.html");
            } catch (Exception e) {
                MessageBox.Show("Gwent requires the Microsoft Edge WebView2 Runtime and write access to the Profil folder.\n\n" + e.Message, "Unable to launch Gwent");
                Close();
            }
        };
    }

    private void HandleLan(CoreWebView2 web, string command) {
        if (command.StartsWith("send:")) {
            if (lanLink != null) lanLink.Send(command.Substring(5));
            return;
        }
        if (lanLink != null) { lanLink.Dispose(); lanLink = null; }
        if (command != "host" && !command.StartsWith("join:")) return;
        var json = new JavaScriptSerializer();
        lanLink = new LanLink((kind, value) => web.PostWebMessageAsJson(json.Serialize(new { lan = kind, value })));
        lanLink.Start(command == "host", command == "host" ? null : command.Substring(5));
    }

    protected override void OnFormClosed(FormClosedEventArgs e) {
        if (lanLink != null) lanLink.Dispose();
        base.OnFormClosed(e);
    }

    private void HandleCards(CoreWebView2 web, string root, string message)
    {
        var json = new JavaScriptSerializer();
        string id = null;
        try {
            var request = json.Deserialize<Dictionary<string,string>>(message);
            id = request["id"];
            var folder = Directory.CreateDirectory(Path.Combine(root, "Cards"));
            if ((folder.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Cards must be a local folder.");
            object result;
            switch (request["action"]) {
                case "list":
                    result = folder.EnumerateFiles("*.json").Where(f => f.Extension.Equals(".json", StringComparison.OrdinalIgnoreCase)
                        && (f.Attributes & FileAttributes.ReparsePoint) == 0)
                        .OrderByDescending(f => f.LastWriteTimeUtc).Select(f => f.Name).ToArray();
                    break;
                case "read":
                    string name = request["name"];
                    if (name != Path.GetFileName(name) || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
                        !name.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) throw new IOException("Invalid collection filename.");
                    var file = new FileInfo(Path.Combine(folder.FullName, name));
                    if (!file.Exists || (file.Attributes & FileAttributes.ReparsePoint) != 0 || file.Length > 65536)
                        throw new IOException("Collection file is missing or too large.");
                    result = File.ReadAllText(file.FullName, Encoding.UTF8);
                    break;
                case "export":
                    string owner = request["name"];
                    if (owner.Length > 32 || request["content"].Length > 65536) throw new IOException("Invalid collection.");
                    foreach (char ch in Path.GetInvalidFileNameChars()) owner = owner.Replace(ch, '_');
                    string stem = "Cards-" + owner + "-" + DateTime.Now.ToString("yyyyMMdd-HHmmss-fff");
                    string output = stem + ".json";
                    for (int n = 2; File.Exists(Path.Combine(folder.FullName, output)); n++) output = stem + "-" + n + ".json";
                    string temp = Path.Combine(folder.FullName, Guid.NewGuid().ToString("N") + ".tmp");
                    try {
                        File.WriteAllText(temp, request["content"], new UTF8Encoding(false));
                        File.Move(temp, Path.Combine(folder.FullName, output));
                    } finally {
                        if (File.Exists(temp)) File.Delete(temp);
                    }
                    result = output;
                    break;
                default: throw new IOException("Unknown collection action.");
            }
            web.PostWebMessageAsJson(json.Serialize(new {id, result}));
        } catch (Exception ex) {
            web.PostWebMessageAsJson(json.Serialize(new {id, error = ex.Message}));
        }
    }

    private void FitBoard()
    {
        int width = Math.Min(ClientSize.Width, ClientSize.Height * 16 / 9);
        int height = width * 9 / 16;
        view.SetBounds((ClientSize.Width - width) / 2, (ClientSize.Height - height) / 2, width, height);
    }

    private void SetDisplayMode(string mode)
    {
        if (mode == displayMode || (mode != "fullscreen" && mode != "borderless" && mode != "windowed")) return;
        Screen monitor = displayMode == null ? Screen.FromPoint(Cursor.Position) : Screen.FromControl(this);
        Rectangle work = monitor.WorkingArea;
        if (displayMode == "windowed")
            windowedBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        WindowState = FormWindowState.Normal;
        StartPosition = FormStartPosition.Manual;
        FormBorderStyle = mode == "windowed" ? FormBorderStyle.Sizable : FormBorderStyle.None;
        if (mode == "windowed") {
            if (windowedBounds.IsEmpty || !work.IntersectsWith(windowedBounds)) {
                int width = Math.Min(1280, work.Width * 4 / 5);
                int height = Math.Min(760, work.Height * 4 / 5);
                windowedBounds = new Rectangle(work.X + (work.Width - width) / 2, work.Y + (work.Height - height) / 2, width, height);
            }
            Bounds = windowedBounds;
        } else {
            Bounds = mode == "fullscreen" ? monitor.Bounds : work;
        }
        displayMode = mode;
    }

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [STAThread]
    public static void Main()
    {
        bool first;
        string folder = Environment.GetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER") ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Profil");
        string suffix;
        using (var hash = System.Security.Cryptography.SHA256.Create())
            suffix = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(Path.GetFullPath(folder).ToUpperInvariant())));
        using (var instance = new Mutex(true, @"Local\GwentClassicCollection-" + suffix, out first)) {
            if (!first) { MessageBox.Show("Gwent is already running.", "Gwent"); return; }
            SetProcessDPIAware();
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new GwentWindow());
        }
    }
}

