using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

// One length-prefixed UTF-8 stream per two-player room. All callbacks resume on the UI thread.
internal sealed class LanLink : IDisposable
{
    public const int Port = 47823;
    const int MaxFrame = 65536;
    readonly Action<string,string> notify;
    readonly SemaphoreSlim writer = new SemaphoreSlim(1, 1);
    TcpListener listener;
    TcpClient peer;
    NetworkStream stream;
    bool closed;
    int queued;

    public LanLink(Action<string,string> notify) { this.notify = notify; }

    static UnicastIPAddressInformation[] Interfaces() {
        return NetworkInterface.GetAllNetworkInterfaces()
            .Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .Select(n => n.GetIPProperties())
            .OrderByDescending(p => p.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork))
            .SelectMany(p => p.UnicastAddresses)
            .Where(i => i.Address.AddressFamily == AddressFamily.InterNetwork && i.IPv4Mask != null).ToArray();
    }

    static bool OnLan(IPAddress address) {
        if (IPAddress.IsLoopback(address)) return true;
        var bytes = address.GetAddressBytes();
        // Home routers can route between different private Wi-Fi and Ethernet subnets.
        if (bytes[0] == 10 || (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
            (bytes[0] == 192 && bytes[1] == 168)) return true;
        return Interfaces().Any(i => {
            var local = i.Address.GetAddressBytes();
            var mask = i.IPv4Mask.GetAddressBytes();
            return mask.Any(b => b != 0) && Enumerable.Range(0,4).All(n => (local[n] & mask[n]) == (bytes[n] & mask[n]));
        });
    }

    public async void Start(bool host, string ip) {
        try {
            if (host) {
                listener = new TcpListener(IPAddress.Any, Port);
                listener.Server.ExclusiveAddressUse = true;
                listener.Start(1);
                string addresses = String.Join(", ", Interfaces().Select(i => i.Address.ToString()).Distinct());
                if (addresses.Length == 0) throw new IOException("Connect the host computer to Wi-Fi or Ethernet, then open the lobby again.");
                notify("listening", addresses);
                while (!closed) {
                    var incoming = await listener.AcceptTcpClientAsync();
                    if (!closed && OnLan(((IPEndPoint)incoming.Client.RemoteEndPoint).Address)) { peer = incoming; break; }
                    incoming.Close();
                }
                if (closed) return;
                listener.Stop();
                listener = null;
            } else {
                IPAddress address;
                if (!IPAddress.TryParse(ip, out address) || address.AddressFamily != AddressFamily.InterNetwork || !OnLan(address))
                    throw new IOException("Enter an IPv4 address on your local network.");
                peer = new TcpClient(AddressFamily.InterNetwork);
                var connect = peer.ConnectAsync(address, Port);
                if (await Task.WhenAny(connect,Task.Delay(9000)) != connect)
                    throw new IOException("No response from " + ip + " on TCP port 47823. Check that Host LAN Game is open, the host firewall allows Gwent on the home network, and both devices can reach each other.");
                await connect;
            }
            if (closed) return;
            peer.NoDelay = true;
            stream = peer.GetStream();
            notify("connected", "");
            var header = new byte[4];
            while (!closed) {
                await ReadAll(header);
                int size = IPAddress.NetworkToHostOrder(BitConverter.ToInt32(header,0));
                if (size <= 0 || size > MaxFrame) throw new IOException("Incompatible LAN message.");
                var body = new byte[size];
                await ReadAll(body);
                notify("packet", Encoding.UTF8.GetString(body));
            }
        } catch (SocketException error) {
            string message;
            switch (error.SocketErrorCode) {
                case SocketError.ConnectionRefused:
                    message = "Connection refused by " + ip + " on TCP port 47823. Open Host LAN Game on that computer and retry."; break;
                case SocketError.HostUnreachable:
                case SocketError.NetworkUnreachable:
                    message = "Windows cannot reach " + ip + ". Check the host address and that both computers are on the same home network."; break;
                case SocketError.AddressAlreadyInUse:
                    message = "TCP port 47823 is already in use. Close the other host lobby and retry."; break;
                case SocketError.TimedOut:
                    message = "The LAN connection timed out. Check the host address, the host firewall and Wi-Fi client isolation."; break;
                default:
                    message = "LAN socket error " + error.ErrorCode + ": " + error.Message; break;
            }
            Fail(new IOException(message,error));
        } catch (Exception error) { Fail(error); }
    }

    async Task ReadAll(byte[] bytes) {
        int offset = 0;
        while (offset < bytes.Length) {
            int n = await stream.ReadAsync(bytes,offset,bytes.Length-offset);
            if (n == 0) throw new IOException("The other player disconnected.");
            offset += n;
        }
    }

    public async void Send(string payload) {
        if (closed || stream == null) return;
        try {
            byte[] body = Encoding.UTF8.GetBytes(payload);
            if (body.Length > MaxFrame || ++queued > 48) throw new IOException("The LAN connection could not keep up.");
            var frame = new byte[body.Length + 4];
            BitConverter.GetBytes(IPAddress.HostToNetworkOrder(body.Length)).CopyTo(frame,0);
            body.CopyTo(frame,4);
            await writer.WaitAsync();
            try { if (!closed) await stream.WriteAsync(frame,0,frame.Length); }
            finally { queued--; writer.Release(); }
        } catch (Exception error) { Fail(error); }
    }
    void Fail(Exception error) {
        if (closed) return;
        Dispose();
        notify("closed",error.Message);
    }
    public void Dispose() {
        closed = true;
        if (listener != null) listener.Stop();
        if (peer != null) peer.Close();
    }
}
