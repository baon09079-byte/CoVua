using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Covua.Models
{
    [Table("Rooms")]
    public class Room
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(10)]
        [Column("room_code")]
        public string RoomCode { get; set; } = string.Empty;

        [Column("host_user_id")]
        public int HostUserId { get; set; }

        [MaxLength(20)]
        public string Status { get; set; } = "waiting";

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.Now;

        [ForeignKey("HostUserId")]
        public virtual User? HostUser { get; set; }
    }
}

