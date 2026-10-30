using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.Mvc;

namespace Covua.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ServerInfoController : ControllerBase
    {
        private static string GetLocalIpAddress()
        {
            try
            {
                var host = Dns.GetHostEntry(Dns.GetHostName());
                foreach (var ip in host.AddressList)
                {
                    if (ip.AddressFamily == AddressFamily.InterNetwork &&
                        !IPAddress.IsLoopback(ip) &&
                        !ip.ToString().StartsWith("26.") && // Bỏ qua Radmin VPN
                        !ip.ToString().StartsWith("169.254.")) // Bỏ qua APIPA
                    {
                        return ip.ToString();
                    }
                }
            }
            catch { }
            return "127.0.0.1";
        }

        [HttpGet]
        public IActionResult GetServerInfo()
        {
            var ip = GetLocalIpAddress();
            var port = Request.Host.Port ?? (Request.IsHttps ? 443 : 80);
            return Ok(new
            {
                ip,
                port,
                origin = $"{Request.Scheme}://{Request.Host.Value}"
            });
        }
    }
}
