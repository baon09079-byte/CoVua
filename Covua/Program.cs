using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection;
using Covua.Data;

var builder = WebApplication.CreateBuilder(args);

// Cấu hình MVC Controllers & Views
builder.Services.AddControllersWithViews();

// Cấu hình Data Protection không phụ thuộc registry/appdata để tránh lỗi Access Denied
builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();

// Cấu hình CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

// Cấu hình CSDL kép (Dual-mode Database): SQL Server ưu tiên, tự động Fallback In-Memory nếu SQL Server chưa bật
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection") 
    ?? "Server=.;Database=CoVua;Trusted_Connection=True;TrustServerCertificate=True;";

bool isSqlServerAvailable = false;
try
{
    var builderConn = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(connectionString)
    {
        ConnectTimeout = 2 // Thử kết nối trong 2 giây
    };
    using var testConn = new Microsoft.Data.SqlClient.SqlConnection(builderConn.ConnectionString);
    testConn.Open();
    isSqlServerAvailable = true;
    Console.WriteLine("[CSDL ASP.NET Core] Kết nối thành công trực tiếp tới Microsoft SQL Server: CoVua");
}
catch
{
    isSqlServerAvailable = false;
    Console.WriteLine("[CSDL ASP.NET Core] SQL Server không khả dụng. Đang kích hoạt In-Memory Database tự động!");
}

if (isSqlServerAvailable)
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseSqlServer(connectionString));
}
else
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseInMemoryDatabase("CoVua_Db"));
}

var app = builder.Build();

// Khởi tạo bảng và nạp dữ liệu mẫu ban đầu
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    DbInitializer.SeedData(dbContext);
}

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
        ctx.Context.Response.Headers["Pragma"] = "no-cache";
        ctx.Context.Response.Headers["Expires"] = "0";
    }
});

app.UseRouting();

app.UseCors();

// Bật hỗ trợ WebSockets và Proxy chuyển tiếp Socket.IO về Node.js (cổng 3000)
app.UseWebSockets();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/socket.io"))
    {
        var targetUri = new UriBuilder("http://localhost:3000")
        {
            Path = context.Request.Path,
            Query = context.Request.QueryString.Value
        }.Uri;

        if (context.WebSockets.IsWebSocketRequest)
        {
            using var clientWs = new System.Net.WebSockets.ClientWebSocket();
            var wsTargetUri = new UriBuilder("ws://localhost:3000")
            {
                Path = context.Request.Path,
                Query = context.Request.QueryString.Value
            }.Uri;

            try
            {
                await clientWs.ConnectAsync(wsTargetUri, context.RequestAborted);
                using var serverWs = await context.WebSockets.AcceptWebSocketAsync();

                var t1 = Task.Run(async () =>
                {
                    var b1 = new byte[1024 * 8];
                    while (serverWs.State == System.Net.WebSockets.WebSocketState.Open && clientWs.State == System.Net.WebSockets.WebSocketState.Open)
                    {
                        var res = await serverWs.ReceiveAsync(new ArraySegment<byte>(b1), context.RequestAborted);
                        if (res.MessageType == System.Net.WebSockets.WebSocketMessageType.Close) break;
                        await clientWs.SendAsync(new ArraySegment<byte>(b1, 0, res.Count), res.MessageType, res.EndOfMessage, context.RequestAborted);
                    }
                });

                var t2 = Task.Run(async () =>
                {
                    var b2 = new byte[1024 * 8];
                    while (serverWs.State == System.Net.WebSockets.WebSocketState.Open && clientWs.State == System.Net.WebSockets.WebSocketState.Open)
                    {
                        var res = await clientWs.ReceiveAsync(new ArraySegment<byte>(b2), context.RequestAborted);
                        if (res.MessageType == System.Net.WebSockets.WebSocketMessageType.Close) break;
                        await serverWs.SendAsync(new ArraySegment<byte>(b2, 0, res.Count), res.MessageType, res.EndOfMessage, context.RequestAborted);
                    }
                });

                await Task.WhenAny(t1, t2);
                return;
            }
            catch
            {
                context.Response.StatusCode = 502;
                return;
            }
        }
        else
        {
            using var httpClient = new HttpClient();
            var reqMsg = new HttpRequestMessage(new HttpMethod(context.Request.Method), targetUri);
            if (context.Request.ContentLength > 0 || context.Request.ContentType != null)
            {
                reqMsg.Content = new StreamContent(context.Request.Body);
                if (context.Request.ContentType != null)
                    reqMsg.Content.Headers.ContentType = System.Net.Http.Headers.MediaTypeHeaderValue.Parse(context.Request.ContentType);
            }

            try
            {
                using var resp = await httpClient.SendAsync(reqMsg, HttpCompletionOption.ResponseHeadersRead, context.RequestAborted);
                context.Response.StatusCode = (int)resp.StatusCode;
                foreach (var h in resp.Headers)
                {
                    context.Response.Headers[h.Key] = h.Value.ToArray();
                }
                foreach (var h in resp.Content.Headers)
                {
                    context.Response.Headers[h.Key] = h.Value.ToArray();
                }
                context.Response.Headers.Remove("transfer-encoding");
                await resp.Content.CopyToAsync(context.Response.Body);
                return;
            }
            catch
            {
                context.Response.StatusCode = 502;
                return;
            }
        }
    }

    await next();
});

app.UseAuthorization();

app.MapControllers();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
