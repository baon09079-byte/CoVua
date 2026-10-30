const db = require('../database/db');

exports.getHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const [games] = await db.execute(`
            SELECT g.*, 
                   uw.username as white_player_name, 
                   ub.username as black_player_name
            FROM Games g
            LEFT JOIN Users uw ON g.white_player_id = uw.id
            LEFT JOIN Users ub ON g.black_player_id = ub.id
            WHERE g.white_player_id = ? OR g.black_player_id = ?
            ORDER BY g.started_at DESC
        `, [userId, userId]);
        
        const result = (games || []).map(g => {
            if (!g.white_player_name) {
                g.white_player_name = g.white_player_id > 10000 ? `Khách_${g.white_player_id}` : 'Quân Trắng';
            }
            if (!g.black_player_name) {
                g.black_player_name = g.black_player_id > 10000 ? `Khách_${g.black_player_id}` : 'Quân Đen';
            }
            return g;
        });

        res.json(result);
    } catch (error) {
        console.error('Lỗi lấy lịch sử đấu:', error);
        res.status(500).json({ message: 'Lỗi server khi lấy lịch sử đấu' });
    }
};

exports.getStats = async (req, res) => {
    try {
        const { userId } = req.params;
        const [stats] = await db.execute(`
            SELECT 
                COUNT(*) as total_games,
                SUM(CASE 
                    WHEN (white_player_id = ? AND result = 'white_win') OR (black_player_id = ? AND result = 'black_win') THEN 1 
                    ELSE 0 
                END) as wins,
                SUM(CASE 
                    WHEN (white_player_id = ? AND result = 'black_win') OR (black_player_id = ? AND result = 'white_win') THEN 1 
                    ELSE 0 
                END) as losses,
                SUM(CASE WHEN result = 'draw' THEN 1 ELSE 0 END) as draws
            FROM Games
            WHERE (white_player_id = ? OR black_player_id = ?) AND status = 'finished'
        `, [userId, userId, userId, userId, userId, userId]);
        
        res.json(stats && stats[0] ? stats[0] : { total_games: 0, wins: 0, losses: 0, draws: 0 });
    } catch (error) {
        console.error('Lỗi lấy thống kê:', error);
        res.status(500).json({ message: 'Lỗi server khi lấy thống kê' });
    }
};

exports.getGameById = async (req, res) => {
    try {
        const { id } = req.params;
        const [games] = await db.execute(`
            SELECT g.*, 
                   uw.username as white_player_name, 
                   ub.username as black_player_name
            FROM Games g
            LEFT JOIN Users uw ON g.white_player_id = uw.id
            LEFT JOIN Users ub ON g.black_player_id = ub.id
            WHERE g.id = ?
        `, [id]);
        
        if (!games || games.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy trận đấu' });
        }
        
        const g = games[0];
        if (!g.white_player_name) {
            g.white_player_name = g.white_player_id > 10000 ? `Khách_${g.white_player_id}` : 'Quân Trắng';
        }
        if (!g.black_player_name) {
            g.black_player_name = g.black_player_id > 10000 ? `Khách_${g.black_player_id}` : 'Quân Đen';
        }
        res.json(g);
    } catch (error) {
        console.error('Lỗi lấy thông tin trận đấu:', error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

// Lưu ván cờ (đấu với máy tính hoặc lưu trữ sau ván đấu) để xem lại Replay
exports.saveGame = async (req, res) => {
    try {
        const { userId, username, playerColor, result, currentFen, moveHistory, difficulty } = req.body;

        // 1. Đảm bảo có User ID hợp lệ của người chơi
        let validUserId = 1;
        if (userId) {
            const [u] = await db.execute('SELECT id FROM Users WHERE id = ?', [userId]);
            if (u && u.length > 0) validUserId = u[0].id;
        } else if (username) {
            const [u] = await db.execute('SELECT id FROM Users WHERE username = ?', [username]);
            if (u && u.length > 0) validUserId = u[0].id;
        }

        // 2. Đảm bảo có tài khoản Máy tính (AI) trong CSDL
        let aiUserId = 1;
        const [aiUsers] = await db.execute("SELECT id FROM Users WHERE username = N'Máy tính (AI)'");
        if (aiUsers && aiUsers.length > 0) {
            aiUserId = aiUsers[0].id;
        } else {
            const [insAi] = await db.execute(
                "INSERT INTO Users (username, email, password_hash) VALUES (N'Máy tính (AI)', 'ai_bot@chess.local', '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC')"
            );
            aiUserId = insAi.insertId || 1;
        }

        // 3. Đảm bảo có Room dành cho đấu với máy
        let roomId = 1;
        const [compRooms] = await db.execute("SELECT id FROM Rooms WHERE room_code = 'COMPUTER'");
        if (compRooms && compRooms.length > 0) {
            roomId = compRooms[0].id;
        } else {
            const [insRoom] = await db.execute(
                "INSERT INTO Rooms (room_code, host_user_id, status) VALUES ('COMPUTER', ?, 'finished')",
                [validUserId]
            );
            roomId = insRoom.insertId || 1;
        }

        // 4. Xác định bên Trắng / Đen
        const isUserWhite = (playerColor !== 'b');
        const whiteId = isUserWhite ? validUserId : aiUserId;
        const blackId = isUserWhite ? aiUserId : validUserId;

        const historyStr = Array.isArray(moveHistory) ? JSON.stringify(moveHistory) : (moveHistory || '[]');
        const finalFen = currentFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const gameResult = result || 'none';

        const [insGame] = await db.execute(
            `INSERT INTO Games (room_id, white_player_id, black_player_id, current_fen, move_history, status, result, started_at, ended_at)
             VALUES (?, ?, ?, ?, ?, 'finished', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [roomId, whiteId, blackId, finalFen, historyStr, gameResult]
        );

        res.json({
            success: true,
            gameId: insGame.insertId,
            message: 'Đã lưu ván cờ thành công để xem lại replay!'
        });
    } catch (error) {
        console.error('Lỗi khi lưu ván cờ:', error);
        res.status(500).json({ success: false, message: 'Lỗi server khi lưu ván cờ: ' + error.message });
    }
};

