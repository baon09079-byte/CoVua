$conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=True;TrustServerCertificate=True;")
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'CoVua')
BEGIN
    CREATE DATABASE CoVua;
END
"@
$cmd.ExecuteNonQuery()
$conn.Close()

$connDb = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Database=CoVua;Integrated Security=True;TrustServerCertificate=True;")
$connDb.Open()
$cmdDb = $connDb.CreateCommand()
$cmdDb.CommandText = @"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
BEGIN
    CREATE TABLE Users (
        id INT IDENTITY(1,1) PRIMARY KEY,
        username NVARCHAR(50) NOT NULL UNIQUE,
        email NVARCHAR(100) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT GETDATE()
    );
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Rooms')
BEGIN
    CREATE TABLE Rooms (
        id INT IDENTITY(1,1) PRIMARY KEY,
        room_code NVARCHAR(10) NOT NULL UNIQUE,
        host_user_id INT NOT NULL,
        status NVARCHAR(20) DEFAULT 'waiting',
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (host_user_id) REFERENCES Users(id)
    );
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Games')
BEGIN
    CREATE TABLE Games (
        id INT IDENTITY(1,1) PRIMARY KEY,
        room_id INT NOT NULL,
        white_player_id INT NOT NULL,
        black_player_id INT NULL,
        current_fen NVARCHAR(255) DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        move_history NVARCHAR(MAX),
        status NVARCHAR(20) DEFAULT 'playing',
        result NVARCHAR(20) DEFAULT 'none',
        started_at DATETIME DEFAULT GETDATE(),
        ended_at DATETIME NULL,
        FOREIGN KEY (room_id) REFERENCES Rooms(id),
        FOREIGN KEY (white_player_id) REFERENCES Users(id),
        FOREIGN KEY (black_player_id) REFERENCES Users(id)
    );
END

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ChatMessages')
BEGIN
    CREATE TABLE ChatMessages (
        id INT IDENTITY(1,1) PRIMARY KEY,
        room_id INT NOT NULL,
        sender_id INT NOT NULL,
        message NVARCHAR(MAX) NOT NULL,
        created_at DATETIME DEFAULT GETDATE(),
        FOREIGN KEY (room_id) REFERENCES Rooms(id),
        FOREIGN KEY (sender_id) REFERENCES Users(id)
    );
END

-- Seed users
IF NOT EXISTS (SELECT * FROM Users WHERE username = 'nguyenvana')
BEGIN
    INSERT INTO Users (username, email, password_hash) VALUES 
    ('nguyenvana', 'nguyenvana@gmail.com', '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC');
END

IF NOT EXISTS (SELECT * FROM Users WHERE username = 'tranthib')
BEGIN
    INSERT INTO Users (username, email, password_hash) VALUES 
    ('tranthib', 'tranthib@gmail.com', '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC');
END
"@
$cmdDb.ExecuteNonQuery()
Write-Output "SUCCESS: CoVua database and tables initialized in SQL Server!"
$connDb.Close()

