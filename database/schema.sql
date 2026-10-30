-- ============================================================
-- Chess Online - Website chơi cờ vua trực tuyến
-- Nhóm 6 thành viên - Đồ án môn học
-- File SQL khởi tạo cơ sở dữ liệu và dữ liệu mẫu
-- ============================================================

CREATE DATABASE IF NOT EXISTS chess_online CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE chess_online;

-- 1. Bảng Users (Người dùng)
CREATE TABLE IF NOT EXISTS Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_username (username),
    INDEX idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Bảng Rooms (Phòng chơi)
CREATE TABLE IF NOT EXISTS Rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL UNIQUE,
    host_user_id INT NOT NULL,
    status ENUM('waiting', 'playing', 'finished') DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_user_id) REFERENCES Users(id) ON DELETE CASCADE,
    INDEX idx_rooms_code (room_code),
    INDEX idx_rooms_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Bảng Games (Trận đấu cờ vua)
CREATE TABLE IF NOT EXISTS Games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    white_player_id INT NOT NULL,
    black_player_id INT NULL,
    current_fen VARCHAR(255) DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    move_history TEXT,
    status ENUM('playing', 'finished') DEFAULT 'playing',
    result ENUM('white_win', 'black_win', 'draw', 'none') DEFAULT 'none',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    FOREIGN KEY (room_id) REFERENCES Rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (white_player_id) REFERENCES Users(id) ON DELETE CASCADE,
    FOREIGN KEY (black_player_id) REFERENCES Users(id) ON DELETE SET NULL,
    INDEX idx_games_room (room_id),
    INDEX idx_games_players (white_player_id, black_player_id),
    INDEX idx_games_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Bảng ChatMessages (Tin nhắn trong phòng)
CREATE TABLE IF NOT EXISTS ChatMessages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES Rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES Users(id) ON DELETE CASCADE,
    INDEX idx_chat_room (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DỮ LIỆU MẪU ĐỂ KIỂM THỬ (Mật khẩu mặc định đều là: 123456)
-- Hash bcrypt 10 vòng: $2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC
-- ============================================================

INSERT INTO Users (id, username, email, password_hash, created_at) VALUES
(1, 'nguyenvana', 'nguyenvana@gmail.com', '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC', '2026-10-01 10:00:00'),
(2, 'tranthib', 'tranthib@gmail.com', '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC', '2026-10-02 11:30:00'),
(3, 'lequanc', 'lequanc@gmail.com', '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC', '2026-10-03 14:15:00')
ON DUPLICATE KEY UPDATE id=id;

-- Vài phòng mẫu
INSERT INTO Rooms (id, room_code, host_user_id, status, created_at) VALUES
(1, 'CHESS1', 1, 'finished', '2026-10-10 09:00:00'),
(2, 'CHESS2', 2, 'finished', '2026-10-11 15:00:00'),
(3, 'PHONG1', 1, 'waiting', NOW())
ON DUPLICATE KEY UPDATE id=id;

-- Vài trận đấu mẫu có lịch sử nước đi và kết quả
INSERT INTO Games (id, room_id, white_player_id, black_player_id, current_fen, move_history, status, result, started_at, ended_at) VALUES
(1, 1, 1, 2, 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', '["e4","e5","Nf3","Nc6","Bc4","Nf6"]', 'finished', 'white_win', '2026-10-10 09:05:00', '2026-10-10 09:25:00'),
(2, 2, 2, 3, 'rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3', '["f4","e5","g4","Qh4#"]', 'finished', 'black_win', '2026-10-11 15:05:00', '2026-10-11 15:15:00')
ON DUPLICATE KEY UPDATE id=id;

-- Tin nhắn mẫu
INSERT INTO ChatMessages (id, room_id, sender_id, message, created_at) VALUES
(1, 1, 1, 'Chào bạn, chúc bạn chơi vui vẻ!', '2026-10-10 09:05:30'),
(2, 1, 2, 'Chào bạn nhé, mình là bên Đen!', '2026-10-10 09:06:00')
ON DUPLICATE KEY UPDATE id=id;

