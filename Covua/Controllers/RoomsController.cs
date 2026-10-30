using Covua.Data;
using Covua.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Covua.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoomsController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public RoomsController(ApplicationDbContext context)
        {
            _context = context;
        }

        public class CreateRoomDto
        {
            public int UserId { get; set; }
        }

        public class JoinRoomDto
        {
            public string? RoomCode { get; set; }
            public int UserId { get; set; }
        }

        private static string GenerateRoomCode()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            var random = new Random();
            return new string(Enumerable.Repeat(chars, 6).Select(s => s[random.Next(s.Length)]).ToArray());
        }

        [HttpPost("create")]
        public async Task<IActionResult> CreateRoom([FromBody] CreateRoomDto dto)
        {
            try
            {
                if (dto.UserId <= 0)
                {
                    return BadRequest(new { message = "Thiếu thông tin người tạo phòng" });
                }

                var roomCode = GenerateRoomCode();

                var room = new Room
                {
                    RoomCode = roomCode,
                    HostUserId = dto.UserId,
                    Status = "waiting",
                    CreatedAt = DateTime.UtcNow
                };

                _context.Rooms.Add(room);
                await _context.SaveChangesAsync();

                var game = new Game
                {
                    RoomId = room.Id,
                    WhitePlayerId = dto.UserId,
                    BlackPlayerId = null,
                    CurrentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    MoveHistory = "[]",
                    Status = "playing",
                    Result = "none",
                    StartedAt = DateTime.UtcNow
                };

                _context.Games.Add(game);
                await _context.SaveChangesAsync();

                return StatusCode(201, new
                {
                    message = "Tạo phòng thành công",
                    roomCode = room.RoomCode,
                    roomId = room.Id,
                    gameId = game.Id
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi khi tạo phòng: " + ex.Message });
            }
        }

        [HttpPost("join")]
        public async Task<IActionResult> JoinRoom([FromBody] JoinRoomDto dto)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(dto.RoomCode) || dto.UserId <= 0)
                {
                    return BadRequest(new { message = "Thiếu mã phòng hoặc thông tin người chơi" });
                }

                var code = dto.RoomCode.Trim().ToUpper();
                var room = await _context.Rooms.FirstOrDefaultAsync(r => r.RoomCode == code);

                if (room == null)
                {
                    return NotFound(new { message = "Không tìm thấy phòng chơi với mã này" });
                }

                if (room.Status == "finished")
                {
                    // Tự động mở lại phòng nếu chủ phòng hoặc người chơi muốn vào chơi bằng mã phòng
                    room.Status = "playing";
                    await _context.SaveChangesAsync();
                }

                var game = await _context.Games.FirstOrDefaultAsync(g => g.RoomId == room.Id && (g.Status == "playing" || g.Status == "waiting"));
                if (game == null)
                {
                    // Tìm ván cờ gần nhất của phòng
                    game = await _context.Games.Where(g => g.RoomId == room.Id).OrderByDescending(g => g.Id).FirstOrDefaultAsync();
                    if (game != null && (game.MoveHistory == "[]" || string.IsNullOrEmpty(game.MoveHistory) || game.Status == "finished"))
                    {
                        game.Status = "waiting";
                        game.Result = "none";
                        game.CurrentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
                        game.MoveHistory = "[]";
                        await _context.SaveChangesAsync();
                    }
                    else
                    {
                        // Tự động tạo ván cờ mặc định mới
                        game = new Covua.Models.Game
                        {
                            RoomId = room.Id,
                            WhitePlayerId = room.HostUserId,
                            BlackPlayerId = null,
                            CurrentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                            MoveHistory = "[]",
                            Status = "waiting",
                            Result = "none",
                            StartedAt = DateTime.Now
                        };
                        _context.Games.Add(game);
                        await _context.SaveChangesAsync();
                    }
                }

                string color;
                if (game.WhitePlayerId == dto.UserId)
                {
                    color = "white";
                }
                else if (game.BlackPlayerId == dto.UserId)
                {
                    color = "black";
                }
                else if (game.BlackPlayerId == null || game.MoveHistory == "[]" || string.IsNullOrEmpty(game.MoveHistory) || game.Status == "finished")
                {
                    // Tham gia với vai trò Quân Đen
                    game.BlackPlayerId = dto.UserId;
                    game.Status = "playing";
                    room.Status = "playing";
                    await _context.SaveChangesAsync();
                    color = "black";
                }
                else
                {
                    // Khởi động lại trận mới cho đối thủ mới vào
                    game.BlackPlayerId = dto.UserId;
                    game.CurrentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
                    game.MoveHistory = "[]";
                    game.Status = "playing";
                    game.Result = "none";
                    room.Status = "playing";
                    await _context.SaveChangesAsync();
                    color = "black";
                }

                return Ok(new
                {
                    message = "Tham gia phòng thành công",
                    roomId = room.Id,
                    gameId = game.Id,
                    color,
                    roomCode = room.RoomCode
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi khi vào phòng: " + ex.Message });
            }
        }

        [HttpGet("list")]
        public async Task<IActionResult> GetRooms()
        {
            try
            {
                // Dọn dẹp tự động các phòng chờ cũ không còn người
                var staleRooms = await _context.Rooms
                    .Where(r => r.Status == "waiting" && r.CreatedAt < DateTime.UtcNow.AddMinutes(-15))
                    .ToListAsync();
                if (staleRooms.Count > 0)
                {
                    foreach (var sr in staleRooms) sr.Status = "finished";
                    await _context.SaveChangesAsync();
                }

                var rooms = await _context.Rooms
                    .Include(r => r.HostUser)
                    .Where(r => r.Status == "waiting")
                    .OrderByDescending(r => r.CreatedAt)
                    .Take(20)
                    .Select(r => new
                    {
                        id = r.Id,
                        room_code = r.RoomCode,
                        host_user_id = r.HostUserId,
                        host_name = r.HostUser != null ? r.HostUser.Username : "Ẩn danh",
                        status = r.Status,
                        created_at = r.CreatedAt
                    })
                    .ToListAsync();

                return Ok(rooms);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi lấy danh sách phòng: " + ex.Message });
            }
        }

        [HttpGet("{roomCode}")]
        public async Task<IActionResult> GetRoomDetails(string roomCode)
        {
            try
            {
                var code = roomCode.Trim().ToUpper();
                var room = await _context.Rooms
                    .Include(r => r.HostUser)
                    .FirstOrDefaultAsync(r => r.RoomCode == code);

                if (room == null)
                {
                    return NotFound(new { message = "Không tìm thấy phòng chơi" });
                }

                var game = await _context.Games
                    .Include(g => g.WhitePlayer)
                    .Include(g => g.BlackPlayer)
                    .Where(g => g.RoomId == room.Id)
                    .OrderByDescending(g => g.Id)
                    .FirstOrDefaultAsync();

                return Ok(new
                {
                    room = new
                    {
                        id = room.Id,
                        room_code = room.RoomCode,
                        host_user_id = room.HostUserId,
                        host_name = room.HostUser?.Username ?? "Ẩn danh",
                        status = room.Status
                    },
                    game = game == null ? null : new
                    {
                        id = game.Id,
                        white_player_id = game.WhitePlayerId,
                        white_player_name = game.WhitePlayer?.Username ?? "Đang chờ...",
                        black_player_id = game.BlackPlayerId,
                        black_player_name = game.BlackPlayer?.Username ?? "Đang chờ...",
                        current_fen = game.CurrentFen,
                        move_history = game.MoveHistory,
                        status = game.Status
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi chi tiết phòng: " + ex.Message });
            }
        }
    }
}
