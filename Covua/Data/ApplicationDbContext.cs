using Microsoft.EntityFrameworkCore;
using Covua.Models;

namespace Covua.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Room> Rooms { get; set; } = null!;
        public DbSet<Game> Games { get; set; } = null!;
        public DbSet<ChatMessage> ChatMessages { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // User constraints
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasIndex(u => u.Username).IsUnique();
                entity.HasIndex(u => u.Email).IsUnique();
            });

            // Room constraints
            modelBuilder.Entity<Room>(entity =>
            {
                entity.HasIndex(r => r.RoomCode).IsUnique();
                entity.HasOne(r => r.HostUser)
                      .WithMany()
                      .HasForeignKey(r => r.HostUserId)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // Game constraints: Tránh multiple cascade paths trong SQL Server
            modelBuilder.Entity<Game>(entity =>
            {
                entity.HasOne(g => g.Room)
                      .WithMany()
                      .HasForeignKey(g => g.RoomId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(g => g.WhitePlayer)
                      .WithMany()
                      .HasForeignKey(g => g.WhitePlayerId)
                      .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(g => g.BlackPlayer)
                      .WithMany()
                      .HasForeignKey(g => g.BlackPlayerId)
                      .OnDelete(DeleteBehavior.Restrict);
            });

            // ChatMessage constraints
            modelBuilder.Entity<ChatMessage>(entity =>
            {
                entity.HasOne(c => c.Room)
                      .WithMany()
                      .HasForeignKey(c => c.RoomId)
                      .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(c => c.Sender)
                      .WithMany()
                      .HasForeignKey(c => c.SenderId)
                      .OnDelete(DeleteBehavior.Restrict);
            });
        }
    }
}
