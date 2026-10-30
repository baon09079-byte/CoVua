using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Covua.Data;
using Covua.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Covua.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private const string JwtSecret = "chess_online_secret_key_2026_nhom6";

        public AuthController(ApplicationDbContext context)
        {
            _context = context;
        }

        public class RegisterDto
        {
            public string? Username { get; set; }
            public string? Email { get; set; }
            public string? Password { get; set; }
        }

        public class LoginDto
        {
            public string? Username { get; set; }
            public string? Password { get; set; }
        }

        public class UpdateProfileDto
        {
            public string? Username { get; set; }
        }

        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDto dto)
        {
            try
            {
                if (dto == null || string.IsNullOrWhiteSpace(dto.Username) || 
                    string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Password))
                {
                    return BadRequest(new { message = "Vui lòng điền đầy đủ thông tin" });
                }

                var username = dto.Username.Trim();
                var email = dto.Email.Trim();

                if (username.Length < 3)
                {
                    return BadRequest(new { message = "Tên người dùng phải có ít nhất 3 ký tự" });
                }

                if (dto.Password.Length < 6)
                {
                    return BadRequest(new { message = "Mật khẩu phải có ít nhất 6 ký tự" });
                }

                // Kiểm tra trùng username hoặc email
                var existingUser = await _context.Users
                    .FirstOrDefaultAsync(u => u.Username == username || u.Email == email);

                if (existingUser != null)
                {
                    if (string.Equals(existingUser.Username, username, StringComparison.OrdinalIgnoreCase))
                    {
                        return BadRequest(new { message = "Tên đăng nhập đã tồn tại, vui lòng chọn tên khác" });
                    }
                    return BadRequest(new { message = "Email này đã được đăng ký tài khoản" });
                }

                // Mã hóa mật khẩu bằng BCrypt
                var passwordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password, 10);

                var newUser = new User
                {
                    Username = username,
                    Email = email,
                    PasswordHash = passwordHash,
                    CreatedAt = DateTime.UtcNow
                };

                _context.Users.Add(newUser);
                await _context.SaveChangesAsync();

                return StatusCode(201, new { message = "Đăng ký thành công! Hãy đăng nhập." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi máy chủ khi đăng ký: " + ex.Message });
            }
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginDto dto)
        {
            try
            {
                if (dto == null || string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
                {
                    return BadRequest(new { message = "Vui lòng nhập tên đăng nhập và mật khẩu" });
                }

                var usernameOrEmail = dto.Username.Trim();
                var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == usernameOrEmail || u.Email == usernameOrEmail);

                if (user == null || !BCrypt.Net.BCrypt.Verify(dto.Password, user.PasswordHash))
                {
                    return Unauthorized(new { message = "Tên đăng nhập hoặc mật khẩu không chính xác" });
                }

                // Sinh JWT Token
                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.UTF8.GetBytes(JwtSecret);
                var tokenDescriptor = new SecurityTokenDescriptor
                {
                    Subject = new ClaimsIdentity(new[]
                    {
                        new Claim("id", user.Id.ToString()),
                        new Claim(ClaimTypes.Name, user.Username),
                        new Claim(ClaimTypes.Email, user.Email)
                    }),
                    Expires = DateTime.UtcNow.AddDays(7),
                    SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
                };

                var token = tokenHandler.CreateToken(tokenDescriptor);
                var tokenString = tokenHandler.WriteToken(token);

                return Ok(new
                {
                    message = "Đăng nhập thành công",
                    token = tokenString,
                    user = new
                    {
                        id = user.Id,
                        username = user.Username,
                        email = user.Email
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi máy chủ khi đăng nhập: " + ex.Message });
            }
        }

        [HttpGet("me")]
        public async Task<IActionResult> GetMe()
        {
            try
            {
                var authHeader = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Không có quyền truy cập" });
                }

                var token = authHeader.Substring("Bearer ".Length).Trim();
                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.UTF8.GetBytes(JwtSecret);

                var claims = tokenHandler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(key),
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ClockSkew = TimeSpan.Zero
                }, out SecurityToken validatedToken);

                var userIdClaim = claims.FindFirst("id")?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int userId))
                {
                    return Unauthorized(new { message = "Token không hợp lệ" });
                }

                var user = await _context.Users.FindAsync(userId);
                if (user == null)
                {
                    return NotFound(new { message = "Người dùng không tồn tại" });
                }

                return Ok(new
                {
                    id = user.Id,
                    username = user.Username,
                    email = user.Email
                });
            }
            catch
            {
                return Unauthorized(new { message = "Phiên đăng nhập hết hạn hoặc không hợp lệ" });
            }
        }

        [HttpPut("update")]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileDto dto)
        {
            try
            {
                var authHeader = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                {
                    return Unauthorized(new { message = "Không có quyền truy cập" });
                }

                var token = authHeader.Substring("Bearer ".Length).Trim();
                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.UTF8.GetBytes(JwtSecret);

                var claims = tokenHandler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(key),
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ClockSkew = TimeSpan.Zero
                }, out SecurityToken validatedToken);

                var userIdClaim = claims.FindFirst("id")?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out int userId))
                {
                    return Unauthorized(new { message = "Token không hợp lệ" });
                }

                if (dto == null || string.IsNullOrWhiteSpace(dto.Username) || dto.Username.Trim().Length < 3)
                {
                    return BadRequest(new { message = "Tên hiển thị phải có ít nhất 3 ký tự" });
                }

                var newUsername = dto.Username.Trim();
                var existing = await _context.Users.FirstOrDefaultAsync(u => u.Username == newUsername && u.Id != userId);
                if (existing != null)
                {
                    return BadRequest(new { message = "Tên đăng nhập này đã có người sử dụng" });
                }

                var user = await _context.Users.FindAsync(userId);
                if (user == null) return NotFound(new { message = "Người dùng không tồn tại" });

                user.Username = newUsername;
                await _context.SaveChangesAsync();

                return Ok(new { message = "Cập nhật thông tin thành công", username = newUsername });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi máy chủ: " + ex.Message });
            }
        }
    }
}
