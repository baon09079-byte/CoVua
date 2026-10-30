using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Covua.Models
{
    [Table("Games")]
    public class Game
    {
        [Key]
        public int Id { get; set; }

        [Column("room_id")]
        public int RoomId { get; set; }

        [Column("white_player_id")]
        public int WhitePlayerId { get; set; }

        [Column("black_player_id")]
        public int? BlackPlayerId { get; set; }

        [MaxLength(255)]
        [Column("current_fen")]
        public string CurrentFen { get; set; } = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

        [Column("move_history")]
        public string? MoveHistory { get; set; } = "[]";

        [MaxLength(20)]
        public string Status { get; set; } = "playing";

        [MaxLength(20)]
        public string Result { get; set; } = "none";

        [Column("started_at")]
        public DateTime StartedAt { get; set; } = DateTime.Now;

        [Column("ended_at")]
        public DateTime? EndedAt { get; set; }

        [ForeignKey("RoomId")]
        public virtual Room? Room { get; set; }

        [ForeignKey("WhitePlayerId")]
        public virtual User? WhitePlayer { get; set; }

        [ForeignKey("BlackPlayerId")]
        public virtual User? BlackPlayer { get; set; }
    }
}

