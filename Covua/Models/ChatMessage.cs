using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Covua.Models
{
    [Table("ChatMessages")]
    public class ChatMessage
    {
        [Key]
        public int Id { get; set; }

        [Column("room_id")]
        public int RoomId { get; set; }

        [Column("sender_id")]
        public int SenderId { get; set; }

        public string Message { get; set; } = string.Empty;

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;

        [ForeignKey("RoomId")]
        public virtual Room? Room { get; set; }

        [ForeignKey("SenderId")]
        public virtual User? Sender { get; set; }
    }
}

