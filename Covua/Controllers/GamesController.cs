using Covua.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Covua.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class GamesController : ControllerBase
    {
        private readonly ApplicationDbContext _context;

        public GamesController(ApplicationDbContext context)
        {
            _context = context;
        }

        [HttpGet("stats/{userId}")]
        public async Task<IActionResult> GetStats(int userId)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null)
                {
                    return NotFound(new { message = "Không tìm thấy người dùng" });
                }

                var games = await _context.Games
                    .Where(g => (g.WhitePlayerId == userId || g.BlackPlayerId == userId) && g.Status == "finished")
                    .ToListAsync();

                int total = games.Count;
                int wins = 0;
                int losses = 0;
                int draws = 0;

                foreach (var g in games)
                {
                    bool isWhite = g.WhitePlayerId == userId;
                    if (g.Result == "draw")
                    {
                        draws++;
                    }
                    else if ((isWhite && g.Result == "white_win") || (!isWhite && g.Result == "black_win"))
                    {
                        wins++;
                    }
                    else if (g.Result != "none")
                    {
                        losses++;
                    }
                }

                return Ok(new
                {
                    user = new { id = user.Id, username = user.Username, email = user.Email },
                    total_games = total,
                    wins,
                    losses,
                    draws,
                    win_rate = total > 0 ? (int)Math.Round((double)wins / total * 100) : 0
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi lấy thống kê: " + ex.Message });
            }
        }

        [HttpGet("history/{userId}")]
        public async Task<IActionResult> GetHistory(int userId)
        {
            try
            {
                var games = await _context.Games
                    .AsNoTracking()
                    .Where(g => (g.WhitePlayerId == userId || g.BlackPlayerId == userId) && g.Status == "finished")
                    .OrderByDescending(g => g.EndedAt ?? g.StartedAt)
                    .Take(30)
                    .ToListAsync();

                var userIds = games.Select(g => g.WhitePlayerId)
                    .Concat(games.Where(g => g.BlackPlayerId.HasValue).Select(g => g.BlackPlayerId!.Value))
                    .Distinct()
                    .ToList();

                var users = await _context.Users
                    .AsNoTracking()
                    .Where(u => userIds.Contains(u.Id))
                    .ToDictionaryAsync(u => u.Id, u => u.Username);

                var roomIds = games.Select(g => g.RoomId).Distinct().ToList();
                var rooms = await _context.Rooms
                    .AsNoTracking()
                    .Where(r => roomIds.Contains(r.Id))
                    .ToDictionaryAsync(r => r.Id, r => r.RoomCode);

                var result = games.Select(g =>
                {
                    string whiteName = users.TryGetValue(g.WhitePlayerId, out var wName) ? wName : (g.WhitePlayerId > 10000 ? $"Khách_{g.WhitePlayerId}" : "Quân Trắng");
                    string blackName = g.BlackPlayerId.HasValue && users.TryGetValue(g.BlackPlayerId.Value, out var bName) ? bName : (g.BlackPlayerId.HasValue && g.BlackPlayerId.Value > 10000 ? $"Khách_{g.BlackPlayerId.Value}" : "Đang chờ");
                    string roomCode = rooms.TryGetValue(g.RoomId, out var rc) ? rc : "N/A";

                    return new
                    {
                        id = g.Id,
                        room_code = roomCode,
                        white_player_id = g.WhitePlayerId,
                        white_username = whiteName,
                        white_player_name = whiteName,
                        black_player_id = g.BlackPlayerId,
                        black_username = blackName,
                        black_player_name = blackName,
                        result = g.Result,
                        current_fen = g.CurrentFen,
                        move_history = g.MoveHistory,
                        started_at = g.StartedAt,
                        ended_at = g.EndedAt
                    };
                });

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi lịch sử đấu: " + ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetGameById(int id)
        {
            try
            {
                var game = await _context.Games
                    .AsNoTracking()
                    .FirstOrDefaultAsync(g => g.Id == id);

                if (game == null)
                {
                    return NotFound(new { message = "Không tìm thấy ván cờ" });
                }

                var whiteUser = await _context.Users.FindAsync(game.WhitePlayerId);
                var blackUser = game.BlackPlayerId.HasValue ? await _context.Users.FindAsync(game.BlackPlayerId.Value) : null;
                var room = await _context.Rooms.FindAsync(game.RoomId);

                string whiteName = whiteUser?.Username ?? (game.WhitePlayerId > 10000 ? $"Khách_{game.WhitePlayerId}" : "Quân Trắng");
                string blackName = blackUser?.Username ?? (game.BlackPlayerId.HasValue && game.BlackPlayerId.Value > 10000 ? $"Khách_{game.BlackPlayerId.Value}" : "Quân Đen");

                return Ok(new
                {
                    id = game.Id,
                    room_code = room?.RoomCode ?? "N/A",
                    white_player_id = game.WhitePlayerId,
                    white_player_name = whiteName,
                    black_player_id = game.BlackPlayerId,
                    black_player_name = blackName,
                    current_fen = game.CurrentFen,
                    move_history = game.MoveHistory,
                    status = game.Status,
                    result = game.Result
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi chi tiết ván cờ: " + ex.Message });
            }
        }

        [HttpPost("save")]
        public async Task<IActionResult> SaveGame([FromBody] SaveGameDto dto)
        {
            try
            {
                int validUserId = 1;
                if (dto.UserId.HasValue && dto.UserId.Value > 0)
                {
                    var u = await _context.Users.FindAsync(dto.UserId.Value);
                    if (u != null) validUserId = u.Id;
                }
                else if (!string.IsNullOrEmpty(dto.Username))
                {
                    var u = await _context.Users.FirstOrDefaultAsync(x => x.Username == dto.Username);
                    if (u != null) validUserId = u.Id;
                }

                var aiUser = await _context.Users.FirstOrDefaultAsync(u => u.Username == "Máy tính (AI)");
                if (aiUser == null)
                {
                    aiUser = new Covua.Models.User
                    {
                        Username = "Máy tính (AI)",
                        Email = "ai_bot@chess.local",
                        PasswordHash = "$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC",
                        CreatedAt = DateTime.Now
                    };
                    _context.Users.Add(aiUser);
                    await _context.SaveChangesAsync();
                }

                var compRoom = await _context.Rooms.FirstOrDefaultAsync(r => r.RoomCode == "COMPUTER");
                if (compRoom == null)
                {
                    compRoom = new Covua.Models.Room
                    {
                        RoomCode = "COMPUTER",
                        HostUserId = validUserId,
                        Status = "finished",
                        CreatedAt = DateTime.Now
                    };
                    _context.Rooms.Add(compRoom);
                    await _context.SaveChangesAsync();
                }

                bool isUserWhite = dto.PlayerColor != "b";
                int whiteId = isUserWhite ? validUserId : aiUser.Id;
                int blackId = isUserWhite ? aiUser.Id : validUserId;

                string historyJson = dto.MoveHistory is string str 
                    ? str 
                    : System.Text.Json.JsonSerializer.Serialize(dto.MoveHistory ?? new List<string>());

                var newGame = new Covua.Models.Game
                {
                    RoomId = compRoom.Id,
                    WhitePlayerId = whiteId,
                    BlackPlayerId = blackId,
                    CurrentFen = dto.CurrentFen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                    MoveHistory = historyJson,
                    Status = "finished",
                    Result = dto.Result ?? "none",
                    StartedAt = DateTime.Now,
                    EndedAt = DateTime.Now
                };

                _context.Games.Add(newGame);
                await _context.SaveChangesAsync();

                return Ok(new
                {
                    success = true,
                    gameId = newGame.Id,
                    message = "Đã lưu ván cờ thành công để xem lại replay!"
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = "Lỗi lưu ván cờ: " + ex.Message });
            }
        }
    }

    public class SaveGameDto
    {
        public int? UserId { get; set; }
        public string? Username { get; set; }
        public string? PlayerColor { get; set; }
        public string? Result { get; set; }
        public string? CurrentFen { get; set; }
        public object? MoveHistory { get; set; }
        public string? Difficulty { get; set; }
    }
}
