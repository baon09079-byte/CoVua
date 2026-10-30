const db = require('../database/db');

// Sinh mã phòng ngẫu nhiên 6 ký tự
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

exports.createRoom = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: 'Thiếu thông tin người tạo phòng' });
        }

        const roomCode = generateRoomCode();
        
        // 1. Tạo phòng
        const [roomResult] = await db.execute(
            'INSERT INTO Rooms (room_code, host_user_id, status) VALUES (?, ?, ?)',
            [roomCode, userId, 'waiting']
        );
        const roomId = roomResult.insertId;

        // 2. Khởi tạo ván cờ với Host là quân Trắng
        const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        const [gameResult] = await db.execute(
            'INSERT INTO Games (room_id, white_player_id, black_player_id, current_fen, move_history, status, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [roomId, userId, null, initialFen, '[]', 'playing', 'none']
        );

        res.status(201).json({ 
            message: 'Tạo phòng thành công', 
            roomCode, 
            roomId,
            gameId: gameResult.insertId
        });
    } catch (error) {
        console.error('Lỗi tạo phòng:', error);
        res.status(500).json({ message: 'Lỗi server khi tạo phòng' });
    }
};

exports.joinRoom = async (req, res) => {
    try {
        const { roomCode, userId } = req.body;
        if (!roomCode || !userId) {
            return res.status(400).json({ message: 'Thiếu mã phòng hoặc thông tin người chơi' });
        }

        const upperCode = roomCode.trim().toUpperCase();
        const [rooms] = await db.execute('SELECT * FROM Rooms WHERE UPPER(LTRIM(RTRIM(room_code))) = ?', [upperCode]);
        
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy phòng chơi với mã này' });
        }
        
        const room = rooms[0];
        
        // Lấy game tương ứng
        let [games] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [room.id]);
        let game = games && games[0];

        if (!game) {
            const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
            await db.execute(
                'INSERT INTO Games (room_id, white_player_id, black_player_id, current_fen, move_history, status, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [room.id, room.host_user_id, null, initialFen, '[]', 'waiting', 'none']
            );
            const [newGames] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [room.id]);
            game = newGames && newGames[0];
        }

        // Nếu người chơi là Host (đang vào lại phòng)
        if (Number(room.host_user_id) === Number(userId)) {
            return res.json({ 
                message: 'Chào mừng chủ phòng quay lại', 
                roomId: room.id,
                roomCode: room.room_code,
                role: 'white',
                status: room.status
            });
        }

        // Nếu người chơi là đối thủ đã tham gia trước đó
        if (game && Number(game.black_player_id) === Number(userId)) {
            return res.json({ 
                message: 'Chào mừng bạn quay lại ván đấu', 
                roomId: room.id, 
                roomCode: room.room_code,
                role: 'black',
                status: room.status
            });
        }

        // Nếu phòng đã có người chơi thứ 2 rồi và ván cờ đã bắt đầu đi cờ
        let moves = [];
        try { moves = JSON.parse(game.move_history || '[]'); } catch (e) {}
        if (game && game.black_player_id && Number(game.black_player_id) !== Number(userId) && moves.length > 0) {
            return res.status(400).json({ message: 'Phòng đã đủ 2 người chơi chính thức' });
        }

        // Gán người chơi thứ 2 làm quân Đen và chuyển trạng thái phòng
        await db.execute('UPDATE Rooms SET status = ? WHERE id = ?', ['playing', room.id]);
        if (game) {
            await db.execute('UPDATE Games SET black_player_id = ?, status = ? WHERE id = ?', [userId, 'playing', game.id]);
        }

        res.json({ 
            message: 'Tham gia phòng thành công!', 
            roomId: room.id,
            roomCode: room.room_code,
            role: 'black',
            status: 'playing'
        });
    } catch (error) {
        console.error('Lỗi tham gia phòng:', error);
        res.status(500).json({ message: 'Lỗi server khi tham gia phòng' });
    }
};

exports.getRooms = async (req, res) => {
    try {
        const [rooms] = await db.execute(
            "SELECT r.*, u.username as host_name FROM Rooms r JOIN Users u ON r.host_user_id = u.id WHERE r.status = 'waiting' ORDER BY r.id DESC"
        );
        const io = req.app.get('io');
        if (!io || !rooms || rooms.length === 0) {
            return res.json(rooms || []);
        }

        // Lọc thông minh: Chỉ giữ lại phòng mà thực tế ĐANG CÓ NGƯỜI ĐANG CHỜ trong phòng
        // Nếu phòng không còn ai (cả 2 đã thoát ra), tự động đóng và loại khỏi danh sách!
        const activeWaitingRooms = [];
        for (const r of rooms) {
            const targetRoom = `room_${r.room_code}`;
            const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
            const count = roomSockets ? roomSockets.size : 0;

            if (count > 0) {
                activeWaitingRooms.push(r);
            } else {
                // Tự động cập nhật phòng không còn ai sang finished
                db.execute("UPDATE Rooms SET status = 'finished' WHERE id = ?", [r.id]).catch(() => {});
            }
        }

        res.json(activeWaitingRooms);
    } catch (error) {
        console.error('Lỗi lấy danh sách phòng:', error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};

exports.getRoomDetails = async (req, res) => {
    try {
        const { roomCode } = req.params;
        const upperCode = roomCode.trim().toUpperCase();
        
        const [rooms] = await db.execute('SELECT * FROM Rooms WHERE room_code = ?', [upperCode]);
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy phòng chơi' });
        }
        
        const room = rooms[0];
        const [games] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [room.id]);
        const game = games && games[0];

        // Lấy thông tin người chơi
        let whitePlayer = null;
        let blackPlayer = null;

        if (room.host_user_id) {
            const [u1] = await db.execute('SELECT id, username FROM Users WHERE id = ?', [room.host_user_id]);
            whitePlayer = u1 && u1[0];
        }

        if (game && game.black_player_id) {
            const [u2] = await db.execute('SELECT id, username FROM Users WHERE id = ?', [game.black_player_id]);
            blackPlayer = u2 && u2[0];
        }

        res.json({
            room,
            game: game || null,
            whitePlayer,
            blackPlayer
        });
    } catch (error) {
        console.error('Lỗi lấy chi tiết phòng:', error);
        res.status(500).json({ message: 'Lỗi server' });
    }
};
