using Covua.Models;
using Microsoft.EntityFrameworkCore;

namespace Covua.Data
{
    public static class DbInitializer
    {
        public static void SeedData(ApplicationDbContext context)
        {
            try
            {
                // Đảm bảo cấu trúc bảng đã được tạo
                if (context.Database.IsRelational())
                {
                    context.Database.EnsureCreated();
                }

                // Kiểm tra xem đã có dữ liệu người dùng hay chưa
                if (!context.Users.Any())
                {
                    const string defaultPassHash = "$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC"; // 123456

                    var users = new List<User>
                    {
                        new User
                        {
                            Id = 1,
                            Username = "nguyenvana",
                            Email = "nguyenvana@gmail.com",
                            PasswordHash = defaultPassHash,
                            CreatedAt = DateTime.UtcNow.AddDays(-28)
                        },
                        new User
                        {
                            Id = 2,
                            Username = "tranthib",
                            Email = "tranthib@gmail.com",
                            PasswordHash = defaultPassHash,
                            CreatedAt = DateTime.UtcNow.AddDays(-27)
                        },
                        new User
                        {
                            Id = 3,
                            Username = "lequanc",
                            Email = "lequanc@gmail.com",
                            PasswordHash = defaultPassHash,
                            CreatedAt = DateTime.UtcNow.AddDays(-26)
                        },
                        new User
                        {
                            Id = 4,
                            Username = "Gbao123",
                            Email = "gbao123@gmail.com",
                            PasswordHash = defaultPassHash,
                            CreatedAt = DateTime.UtcNow.AddDays(-10)
                        }
                    };

                    context.Users.AddRange(users);
                    context.SaveChanges();

                    var rooms = new List<Room>
                    {
                        new Room
                        {
                            Id = 1,
                            RoomCode = "CHESS1",
                            HostUserId = 1,
                            Status = "finished",
                            CreatedAt = DateTime.UtcNow.AddDays(-19)
                        },
                        new Room
                        {
                            Id = 2,
                            RoomCode = "CHESS2",
                            HostUserId = 2,
                            Status = "finished",
                            CreatedAt = DateTime.UtcNow.AddDays(-18)
                        },
                        new Room
                        {
                            Id = 3,
                            RoomCode = "PHONG1",
                            HostUserId = 1,
                            Status = "waiting",
                            CreatedAt = DateTime.UtcNow.AddMinutes(-30)
                        }
                    };

                    context.Rooms.AddRange(rooms);
                    context.SaveChanges();

                    var games = new List<Game>
                    {
                        new Game
                        {
                            Id = 1,
                            RoomId = 1,
                            WhitePlayerId = 1,
                            BlackPlayerId = 2,
                            CurrentFen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
                            MoveHistory = "[\"e4\",\"e5\",\"Nf3\",\"Nc6\",\"Bc4\",\"Nf6\"]",
                            Status = "finished",
                            Result = "white_win",
                            StartedAt = DateTime.UtcNow.AddDays(-19),
                            EndedAt = DateTime.UtcNow.AddDays(-19).AddMinutes(20)
                        },
                        new Game
                        {
                            Id = 2,
                            RoomId = 2,
                            WhitePlayerId = 2,
                            BlackPlayerId = 3,
                            CurrentFen = "rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3",
                            MoveHistory = "[\"f4\",\"e5\",\"g4\",\"Qh4#\"]",
                            Status = "finished",
                            Result = "black_win",
                            StartedAt = DateTime.UtcNow.AddDays(-18),
                            EndedAt = DateTime.UtcNow.AddDays(-18).AddMinutes(10)
                        },
                        new Game
                        {
                            Id = 3,
                            RoomId = 3,
                            WhitePlayerId = 1,
                            BlackPlayerId = null,
                            CurrentFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                            MoveHistory = "[]",
                            Status = "playing",
                            Result = "none",
                            StartedAt = DateTime.UtcNow.AddMinutes(-30),
                            EndedAt = null
                        }
                    };

                    context.Games.AddRange(games);
                    context.SaveChanges();

                    var chatMessages = new List<ChatMessage>
                    {
                        new ChatMessage
                        {
                            Id = 1,
                            RoomId = 1,
                            SenderId = 1,
                            Message = "Chào bạn, chúc bạn chơi vui vẻ!",
                            CreatedAt = DateTime.UtcNow.AddDays(-19)
                        },
                        new ChatMessage
                        {
                            Id = 2,
                            RoomId = 1,
                            SenderId = 2,
                            Message = "Chào bạn nhé, mình là bên Đen!",
                            CreatedAt = DateTime.UtcNow.AddDays(-19).AddSeconds(30)
                        }
                    };

                    context.ChatMessages.AddRange(chatMessages);
                    context.SaveChanges();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[DbInitializer Warning]: {ex.Message}");
            }
        }
    }
}
