const { Chess } = require('chess.js');
const db = require('../database/db');

// Đảm bảo userId tồn tại trong bảng Users để tránh lỗi FOREIGN KEY constraint trên SQL Server
async function ensureValidUserId(userId, username) {
    if (!userId && !username) return 1;
    try {
        // 1. Kiểm tra theo ID
        if (userId) {
            const [existingById] = await db.execute('SELECT id FROM Users WHERE id = ?', [userId]);
            if (existingById && existingById.length > 0) {
                return Number(existingById[0].id);
            }
        }
        // 2. Kiểm tra theo Username
        if (username) {
            const [existingByName] = await db.execute('SELECT id FROM Users WHERE username = ?', [username]);
            if (existingByName && existingByName.length > 0) {
                return Number(existingByName[0].id);
            }
        }
        // 3. Nếu chưa có -> tạo mới với username & email duy nhất
        const baseName = username ? username.trim() : `Khach_${Date.now() % 10000}`;
        const uniqueEmail = `${baseName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}@chess.local`;
        const [ins] = await db.execute(
            'INSERT INTO Users (username, email, password_hash) VALUES (?, ?, ?)',
            [baseName, uniqueEmail, '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC']
        );
        return (ins && ins.insertId) ? Number(ins.insertId) : (userId || 1);
    } catch (e) {
        return userId || 1;
    }
}

const disconnectTimers = {};
const roomStagingState = {};
const roomTurnTimers = {};

function clearRoomTurnTimer(targetRoom) {
    if (roomTurnTimers[targetRoom]) {
        clearTimeout(roomTurnTimers[targetRoom].timeout);
        clearInterval(roomTurnTimers[targetRoom].interval);
        delete roomTurnTimers[targetRoom];
    }
}

function startRoomTurnTimer(io, targetRoom, roomCode, gameId) {
    clearRoomTurnTimer(targetRoom);

    let timeLeft = 30;
    io.to(targetRoom).emit('turnTick', { timeLeft });

    const interval = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) {
            io.to(targetRoom).emit('turnTick', { timeLeft });
        }
        if (timeLeft <= 0) {
            clearInterval(interval);
        }
    }, 1000);

    const timeout = setTimeout(async () => {
        try {
            clearRoomTurnTimer(targetRoom);
            await handleTurnTimeoutForfeit(io, targetRoom, roomCode, gameId);
        } catch (err) {
            console.error('[TurnTimeout Error]:', err);
        }
    }, 30000);

    roomTurnTimers[targetRoom] = { timeout, interval, timeLeft: 30 };
}

async function handleTurnTimeoutForfeit(io, targetRoom, roomCode, gameId) {
    try {
        const [games] = await db.execute("SELECT * FROM Games WHERE id = ? AND status = 'playing'", [gameId]);
        if (!games || games.length === 0) return;
        const game = games[0];

        let chess = null;
        try {
            chess = new Chess(game.current_fen);
        } catch (e) {
            return;
        }

        if (chess.isGameOver()) return;

        // Xác định bên đang đến lượt đi mà để quá 30 giây
        const currentTurnColor = chess.turn(); // 'w' hoặc 'b'
        const sideName = currentTurnColor === 'w' ? 'Trắng' : 'Đen';
        const winnerSideName = currentTurnColor === 'w' ? 'Đen' : 'Trắng';
        const gameResult = currentTurnColor === 'w' ? 'black_win' : 'white_win';
        const reason = `Bên ${sideName} đi nước cờ quá 30 giây và bị xử THUA! Bên ${winnerSideName} giành CHIẾN THẮNG!`;

        await db.execute(
            "UPDATE Games SET status = 'finished', result = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?",
            [gameResult, game.id]
        );
        await db.execute(
            "UPDATE Rooms SET status = 'finished' WHERE id = ?",
            [game.room_id]
        );

        clearRoomTurnTimer(targetRoom);

        io.to(targetRoom).emit('gameOver', {
            result: gameResult,
            reason
        });

        console.log(`[TurnTimeout Forfeit] ${targetRoom}: Bên ${sideName} đi nước cờ quá 30 giây -> Xử THUA. Bên ${winnerSideName} thắng.`);
    } catch (err) {
        console.error('[handleTurnTimeoutForfeit Error]:', err);
    }
}

module.exports = (io) => {
    io.on('connection', (socket) => {
        let currentRoom = null;
        let currentUser = null;

        // 1. Tham gia phòng chơi
        socket.on('joinRoom', async ({ roomId, roomCode, userId, username }) => {
            try {
                userId = await ensureValidUserId(userId, username);
                const targetRoom = roomCode ? `room_${roomCode}` : `room_${roomId}`;
                socket.join(targetRoom);
                currentRoom = targetRoom;
                currentUser = { id: userId, username };
                socket.dbUserId = userId;
                socket.userName = username;
                socket.currentRoom = targetRoom;

                // Hủy bộ đếm thời gian xử thua nếu người chơi tải lại trang (F5) hoặc kết nối lại kịp thời
                const timerKey = `forfeit_${targetRoom}_${userId}`;
                if (disconnectTimers[timerKey]) {
                    clearTimeout(disconnectTimers[timerKey]);
                    delete disconnectTimers[timerKey];
                    console.log(`[Socket] ${username} đã kịp thời kết nối lại ${targetRoom}, hủy đếm ngược xử thua!`);
                    socket.to(targetRoom).emit('playerReconnected', {
                        username,
                        message: `${username} đã kết nối lại ván đấu!`
                    });
                }

                console.log(`[Socket] Người chơi ${username} (ID: ${userId}) đã vào phòng ${targetRoom}`);

                // Lấy thông tin phòng và game từ DB
                let games = [];
                let room = null;

                if (roomCode) {
                    const [rooms] = await db.execute('SELECT * FROM Rooms WHERE room_code = ?', [roomCode]);
                    room = rooms && rooms[0];
                    if (room) {
                        const [g] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [room.id]);
                        games = g;
                    }
                } else if (roomId) {
                    const [rooms] = await db.execute('SELECT * FROM Rooms WHERE id = ?', [roomId]);
                    room = rooms && rooms[0];
                    const [g] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [roomId]);
                    games = g;
                }

                if (!room && roomCode) {
                    try {
                        await db.execute(
                            'INSERT INTO Rooms (room_code, host_user_id, status) VALUES (?, ?, ?)',
                            [roomCode, userId, 'waiting']
                        );
                        const [newRooms] = await db.execute('SELECT * FROM Rooms WHERE room_code = ?', [roomCode]);
                        room = newRooms && newRooms[0];
                    } catch (e) {
                        console.error('[Socket auto create room error]:', e);
                    }
                }

                if (!room) {
                    return socket.emit('roomNotFound', { roomCode, message: 'Không tìm thấy phòng chơi này trên máy chủ!' });
                }

                const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                if (!games || games.length === 0) {
                    // Tạo ván cờ mặc định nếu phòng chưa có
                    await db.execute(
                        'INSERT INTO Games (room_id, white_player_id, black_player_id, current_fen, move_history, status, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [room.id, userId, null, initialFen, '[]', 'playing', 'none']
                    );
                    const [newG] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [room.id]);
                    games = newG;
                }

                if (games && games.length > 0) {
                    const game = games[0];
                    
                    let history = [];
                    try {
                        history = JSON.parse(game.move_history || '[]');
                    } catch (e) {
                        history = [];
                    }

                    // Đếm số lượng socket đang kết nối trong phòng này
                    const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
                    const activeCount = roomSockets ? roomSockets.size : 1;

                    let whiteName = 'Quân Trắng';
                    let blackName = 'Đang chờ đối thủ...';

                    // Xác định vai trò chuẩn xác dựa trên Host / White / Black trong CSDL
                    const isWhitePlayer = Number(userId) === Number(game.white_player_id) || Number(userId) === Number(room.host_user_id);
                    const isBlackPlayer = Number(userId) === Number(game.black_player_id);

                    if (isWhitePlayer) {
                        socket.userRole = 'white';
                        whiteName = username;
                        if (!game.white_player_id) {
                            game.white_player_id = userId;
                            await db.execute('UPDATE Games SET white_player_id = ? WHERE id = ?', [userId, game.id]);
                        }
                        if (game.black_player_id) {
                            const [ub] = await db.execute('SELECT username FROM Users WHERE id = ?', [game.black_player_id]);
                            if (ub && ub[0]) blackName = ub[0].username;
                        }
                    } else if (isBlackPlayer || !game.black_player_id || history.length === 0) {
                        // Người chơi thứ 2 là Quân Đen
                        socket.userRole = 'black';
                        game.black_player_id = userId;
                        blackName = username;

                        if (game.white_player_id) {
                            const [uw] = await db.execute('SELECT username FROM Users WHERE id = ?', [game.white_player_id]);
                            if (uw && uw[0]) whiteName = uw[0].username;
                        }

                        await db.execute(
                            'UPDATE Games SET black_player_id = ?, status = ? WHERE id = ?',
                            [userId, 'playing', game.id]
                        );
                        await db.execute(
                            'UPDATE Rooms SET status = ? WHERE id = ?',
                            ['playing', room.id]
                        );
                    } else {
                        socket.userRole = 'spectator';
                        if (game.white_player_id) {
                            const [uw] = await db.execute('SELECT username FROM Users WHERE id = ?', [game.white_player_id]);
                            if (uw && uw[0]) whiteName = uw[0].username;
                        }
                        if (game.black_player_id) {
                            const [ub] = await db.execute('SELECT username FROM Users WHERE id = ?', [game.black_player_id]);
                            if (ub && ub[0]) blackName = ub[0].username;
                        }
                    }

                    // Lấy lịch sử chat của phòng
                    const [chatHistory] = await db.execute(
                        'SELECT c.*, u.username FROM ChatMessages c JOIN Users u ON c.sender_id = u.id WHERE c.room_id = ? ORDER BY c.id ASC',
                        [game.room_id]
                    );

                    const isHost = Number(userId) === Number(room.host_user_id);
                    if (!roomStagingState[targetRoom]) {
                        roomStagingState[targetRoom] = {
                            hostUserId: room.host_user_id,
                            isGameStarted: (game.status === 'playing' && history.length > 0),
                            opponentReady: false,
                            blackPlayerId: game.black_player_id
                        };
                    } else {
                        roomStagingState[targetRoom].hostUserId = room.host_user_id;
                    }

                    if (socket.userRole === 'black') {
                        if (history.length === 0) {
                            roomStagingState[targetRoom].isGameStarted = false;
                        }
                        roomStagingState[targetRoom].blackPlayerId = userId;
                        roomStagingState[targetRoom].blackPlayerName = username;
                    }

                    const basePayload = {
                        gameId: game.id,
                        roomId: game.room_id,
                        roomCode: room.room_code,
                        fen: game.current_fen,
                        history,
                        whitePlayerId: game.white_player_id,
                        blackPlayerId: game.black_player_id,
                        whitePlayerName: whiteName,
                        blackPlayerName: blackName,
                        status: game.status,
                        result: game.result,
                        chatHistory: chatHistory || [],
                        isHost: Boolean(isHost),
                        hostUserId: room.host_user_id,
                        isGameStarted: Boolean(roomStagingState[targetRoom]?.isGameStarted),
                        opponentReady: Boolean(roomStagingState[targetRoom]?.opponentReady)
                    };

                    if (socket.userRole === 'black') {
                        // Người chơi Quân Đen vào phòng -> gửi gameState cho cả hai và bắn opponentJoined
                        socket.emit('gameState', { ...basePayload, yourRole: 'black', isHost: false });
                        socket.to(targetRoom).emit('gameState', { ...basePayload, yourRole: 'white', isHost: true });
                        io.to(targetRoom).emit('opponentJoined', {
                            blackPlayerId: userId,
                            blackPlayerName: username,
                            isGameStarted: Boolean(roomStagingState[targetRoom]?.isGameStarted),
                            opponentReady: Boolean(roomStagingState[targetRoom]?.opponentReady)
                        });
                    } else {
                        socket.emit('gameState', { ...basePayload, yourRole: socket.userRole, isHost: Boolean(isHost) });
                    }
                }

                // Thông báo có người vào phòng cho các thành viên khác
                socket.to(targetRoom).emit('playerJoined', {
                    userId,
                    username,
                    message: `${username} đã vào phòng chơi`
                });
            } catch (error) {
                console.error('[Socket joinRoom Error]:', error);
            }
        });

        // 2. Đi nước cờ
        socket.on('move', async ({ roomId, roomCode, move, userId }) => {
            try {
                const targetRoom = roomCode ? `room_${roomCode}` : `room_${roomId}`;
                
                // Lấy ván cờ hiện tại
                let game = null;
                let room = null;
                if (roomCode) {
                    const [rooms] = await db.execute('SELECT id FROM Rooms WHERE room_code = ?', [roomCode]);
                    if (rooms && rooms[0]) {
                        room = rooms[0];
                        const [games] = await db.execute("SELECT * FROM Games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC", [rooms[0].id]);
                        game = games && games[0];
                    }
                } else {
                    const [games] = await db.execute("SELECT * FROM Games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC", [roomId]);
                    game = games && games[0];
                }

                if (!game) {
                    return socket.emit('error', 'Không tìm thấy ván đấu đang diễn ra');
                }

                // Nếu chưa có đối thủ tham gia
                if (!game.black_player_id) {
                    return socket.emit('error', 'Vui lòng đợi bạn bè tham gia phòng trước khi đi cờ!');
                }

                let chess = null;
                try {
                    chess = new Chess(game.current_fen);
                } catch (err) {
                    console.warn('[Socket move] Không thể khởi tạo thế cờ từ FEN (có thể vua đã bị bắt):', err.message);
                    return socket.emit('error', 'Ván cờ này đã kết thúc do vua đã bị bắt!');
                }

                // Kiểm tra lượt đi hợp lệ
                const turn = chess.turn(); // 'w' hoặc 'b'
                const isWhite = socket.userRole === 'white' || Number(game.white_player_id) === Number(userId) || Number(game.white_player_id) === Number(socket.dbUserId);
                const isBlack = socket.userRole === 'black' || Number(game.black_player_id) === Number(userId) || Number(game.black_player_id) === Number(socket.dbUserId);

                if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) {
                    return socket.emit('error', 'Chưa đến lượt của bạn');
                }

                // Thực hiện nước đi trên chess.js
                let moveResult = null;
                try {
                    moveResult = chess.move(move);
                } catch (e) {
                    return socket.emit('error', 'Nước đi không hợp lệ theo luật cờ vua');
                }

                if (!moveResult) {
                    return socket.emit('error', 'Nước đi không hợp lệ');
                }

                // Xóa bộ đếm 10 giây của lượt này khi người chơi đã tự đi nước hợp lệ
                clearRoomTurnTimer(targetRoom);

                const isKingCaptured = (moveResult.captured === 'k' || moveResult.captured === 'K');
                const newFen = chess.fen();
                let history = [];
                try {
                    history = JSON.parse(game.move_history || '[]');
                } catch (e) {
                    history = [];
                }
                history.push(moveResult.san);

                // Cập nhật CSDL
                await db.execute(
                    'UPDATE Games SET current_fen = ?, move_history = ? WHERE id = ?',
                    [newFen, JSON.stringify(history), game.id]
                );

                // Đồng bộ nước đi cho cả 2 người chơi trong phòng
                io.to(targetRoom).emit('move', {
                    move: moveResult,
                    fen: newFen,
                    turn: chess.turn(),
                    history,
                    isKingCaptured
                });

                // Kiểm tra ván cờ kết thúc (kể cả khi ăn được vua đối thủ)
                if (isKingCaptured || chess.isGameOver()) {
                    let gameResult = 'draw';
                    let reason = 'Hòa cờ';

                    if (isKingCaptured) {
                        // Người vừa đi ăn được vua đối thủ -> THẮNG! Bên bị mất vua -> BỊ XỬ THUA!
                        gameResult = (turn === 'w') ? 'white_win' : 'black_win';
                        reason = (turn === 'w') 
                            ? 'Bên Đen bị mất quân Vua và bị xử THUA! Bên Trắng giành CHIẾN THẮNG!' 
                            : 'Bên Trắng bị mất quân Vua và bị xử THUA! Bên Đen giành CHIẾN THẮNG!';
                    } else if (chess.isCheckmate()) {
                        // Người vừa đi thắng
                        gameResult = (turn === 'w') ? 'white_win' : 'black_win';
                        reason = (turn === 'w') ? 'Trắng chiếu hết đối thủ!' : 'Đen chiếu hết đối thủ!';
                    } else if (chess.isStalemate()) {
                        reason = 'Hòa vì hết nước đi (Stalemate)';
                    } else if (chess.isThreefoldRepetition()) {
                        reason = 'Hòa vì lặp lại 3 lần thế cờ';
                    } else if (chess.isInsufficientMaterial()) {
                        reason = 'Hòa do thiếu lực lượng chiếu hết';
                    } else {
                        reason = 'Ván cờ kết thúc';
                    }

                    await db.execute(
                        "UPDATE Games SET status = 'finished', result = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?",
                        [gameResult, game.id]
                    );

                    await db.execute(
                        "UPDATE Rooms SET status = 'finished' WHERE id = ?",
                        [game.room_id]
                    );

                    clearRoomTurnTimer(targetRoom);
                    io.to(targetRoom).emit('gameOver', {
                        result: gameResult,
                        reason
                    });
                } else {
                    // Trận đấu tiếp tục -> bắt đầu đếm 10 giây cho đối thủ
                    startRoomTurnTimer(io, targetRoom, roomCode, game.id);
                }
            } catch (error) {
                console.error('[Socket move Error]:', error);
                socket.emit('error', 'Có lỗi xảy ra khi xử lý nước cờ');
            }
        });

        // 3. Đầu hàng
        socket.on('resign', async ({ roomId, roomCode, userId }) => {
            try {
                const targetRoom = roomCode ? `room_${roomCode}` : `room_${roomId}`;
                
                let game = null;
                if (roomCode) {
                    const [rooms] = await db.execute('SELECT id FROM Rooms WHERE room_code = ?', [roomCode]);
                    if (rooms && rooms[0]) {
                        const [games] = await db.execute("SELECT * FROM Games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC", [rooms[0].id]);
                        game = games && games[0];
                    }
                } else {
                    const [games] = await db.execute("SELECT * FROM Games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC", [roomId]);
                    game = games && games[0];
                }

                if (!game) return;

                const isWhite = Number(game.white_player_id) === Number(userId);
                const gameResult = isWhite ? 'black_win' : 'white_win';
                const reason = isWhite ? 'Bên Trắng đã xin đầu hàng' : 'Bên Đen đã xin đầu hàng';

                await db.execute(
                    "UPDATE Games SET status = 'finished', result = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?",
                    [gameResult, game.id]
                );

                await db.execute(
                    "UPDATE Rooms SET status = 'finished' WHERE id = ?",
                    [game.room_id]
                );

                clearRoomTurnTimer(targetRoom);
                io.to(targetRoom).emit('gameOver', {
                    result: gameResult,
                    reason,
                    resignedBy: userId
                });
            } catch (error) {
                console.error('[Socket resign Error]:', error);
            }
        });

        // 4. Cầu hòa
        socket.on('offerDraw', ({ roomId, roomCode, userId, username }) => {
            const targetRoom = roomCode ? `room_${roomCode}` : `room_${roomId}`;
            socket.to(targetRoom).emit('drawOffered', {
                userId,
                username,
                message: `${username} đề nghị hòa cờ`
            });
        });

        socket.on('respondDraw', async ({ roomId, roomCode, accepted }) => {
            const targetRoom = roomCode ? `room_${roomCode}` : `room_${roomId}`;
            if (accepted) {
                let game = null;
                if (roomCode) {
                    const [rooms] = await db.execute('SELECT id FROM Rooms WHERE room_code = ?', [roomCode]);
                    if (rooms && rooms[0]) {
                        const [games] = await db.execute("SELECT * FROM Games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC", [rooms[0].id]);
                        game = games && games[0];
                    }
                } else {
                    const [games] = await db.execute("SELECT * FROM Games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC", [roomId]);
                    game = games && games[0];
                }

                if (game) {
                    await db.execute(
                        "UPDATE Games SET status = 'finished', result = 'draw', ended_at = CURRENT_TIMESTAMP WHERE id = ?",
                        [game.id]
                    );
                    await db.execute("UPDATE Rooms SET status = 'finished' WHERE id = ?", [game.room_id]);
                }

                io.to(targetRoom).emit('gameOver', {
                    result: 'draw',
                    reason: 'Hai bên đã đồng ý hòa ván cờ'
                });
            } else {
                socket.to(targetRoom).emit('drawDeclined', {
                    message: 'Đối thủ đã từ chối lời đề nghị hòa'
                });
            }
        });

        // 5. Chat trong phòng
        socket.on('chatMessage', async ({ roomId, roomCode, userId, username, message }) => {
            try {
                if (!message || !message.trim()) return;
                const targetRoom = roomCode ? `room_${roomCode}` : `room_${roomId}`;

                // Tìm roomId từ roomCode nếu cần
                let actualRoomId = roomId;
                if (!actualRoomId && roomCode) {
                    const [rooms] = await db.execute('SELECT id FROM Rooms WHERE room_code = ?', [roomCode]);
                    if (rooms && rooms[0]) actualRoomId = rooms[0].id;
                }

                // Lưu tin nhắn vào CSDL
                if (actualRoomId && userId) {
                    const validSenderId = await ensureValidUserId(userId, username);
                    await db.execute(
                        'INSERT INTO ChatMessages (room_id, sender_id, message) VALUES (?, ?, ?)',
                        [actualRoomId, validSenderId, message.trim()]
                    );
                }

                // Gửi tin nhắn cho mọi người trong phòng
                io.to(targetRoom).emit('chatMessage', {
                    userId,
                    username,
                    message: message.trim(),
                    created_at: new Date()
                });
            } catch (error) {
                console.error('[Socket chatMessage Error]:', error);
            }
        });

        // 6. Tín hiệu Video Call WebRTC
        socket.on('videoSignal', ({ roomCode, roomId, signal }) => {
            const targetRoom = roomCode ? `room_${roomCode}` : `room_${roomId}`;
            // Chuyển tín hiệu đến người còn lại trong phòng
            socket.to(targetRoom).emit('videoSignal', signal);
        });

        // 7. Bật/Tắt trạng thái Sẵn sàng của Đối thủ
        socket.on('toggleReady', ({ roomCode }) => {
            const targetRoom = `room_${roomCode}`;
            if (!roomStagingState[targetRoom]) {
                roomStagingState[targetRoom] = { isGameStarted: false, opponentReady: false };
            }
            roomStagingState[targetRoom].opponentReady = !roomStagingState[targetRoom].opponentReady;
            const isReady = roomStagingState[targetRoom].opponentReady;
            io.to(targetRoom).emit('readyStatusChanged', {
                opponentReady: isReady,
                userId: socket.dbUserId,
                username: socket.userName
            });
        });

        // 8. Chủ phòng Bắt đầu trận đấu
        socket.on('startGame', async ({ roomCode }) => {
            try {
                const targetRoom = `room_${roomCode}`;
                const [rooms] = await db.execute('SELECT * FROM Rooms WHERE room_code = ?', [roomCode]);
                if (!rooms || rooms.length === 0) return;
                const room = rooms[0];

                if (Number(socket.dbUserId) !== Number(room.host_user_id)) {
                    return socket.emit('error', 'Chỉ có chủ phòng mới có quyền bắt đầu trận đấu!');
                }

                if (!roomStagingState[targetRoom]) {
                    roomStagingState[targetRoom] = {};
                }
                roomStagingState[targetRoom].isGameStarted = true;

                const [games] = await db.execute("SELECT id FROM Games WHERE room_id = ? ORDER BY id DESC", [room.id]);
                if (games && games[0]) {
                    await db.execute("UPDATE Games SET status = 'playing' WHERE id = ?", [games[0].id]);
                }
                await db.execute("UPDATE Rooms SET status = 'playing' WHERE id = ?", [room.id]);

                io.to(targetRoom).emit('gameStarted', {
                    message: 'Trận đấu đã chính thức bắt đầu! Chúc hai kỳ thủ thi đấu tốt!'
                });
                if (games && games[0]) {
                    startRoomTurnTimer(io, targetRoom, roomCode, games[0].id);
                }
            } catch (err) {
                console.error('[Socket startGame Error]:', err);
            }
        });

        // 9. Chủ phòng kick (đuổi) đối thủ khỏi phòng
        socket.on('kickOpponent', async ({ roomCode }) => {
            try {
                const targetRoom = `room_${roomCode}`;
                clearRoomTurnTimer(targetRoom);
                const [rooms] = await db.execute('SELECT * FROM Rooms WHERE room_code = ?', [roomCode]);
                if (!rooms || rooms.length === 0) return;
                const room = rooms[0];

                if (Number(socket.dbUserId) !== Number(room.host_user_id)) {
                    return socket.emit('error', 'Chỉ có chủ phòng mới có quyền đuổi người chơi khác!');
                }

                const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
                if (roomSockets) {
                    for (const sId of roomSockets) {
                        const s = io.sockets.sockets.get(sId);
                        if (s && s.id !== socket.id && (s.userRole === 'black' || Number(s.dbUserId) !== Number(room.host_user_id))) {
                            s.emit('kicked', { message: 'Bạn đã bị chủ phòng mời ra khỏi phòng chơi!' });
                            s.leave(targetRoom);
                            s.currentRoom = null;
                            s.userRole = null;
                        }
                    }
                }

                const [games] = await db.execute("SELECT id FROM Games WHERE room_id = ? ORDER BY id DESC", [room.id]);
                if (games && games[0]) {
                    await db.execute("UPDATE Games SET black_player_id = NULL, status = 'waiting' WHERE id = ?", [games[0].id]);
                }
                await db.execute("UPDATE Rooms SET status = 'waiting' WHERE id = ?", [room.id]);

                if (roomStagingState[targetRoom]) {
                    roomStagingState[targetRoom].opponentReady = false;
                    roomStagingState[targetRoom].isGameStarted = false;
                    roomStagingState[targetRoom].blackPlayerId = null;
                    roomStagingState[targetRoom].blackPlayerName = null;
                }

                io.to(targetRoom).emit('opponentKicked', {
                    message: 'Chủ phòng đã mời đối thủ ra khỏi phòng.'
                });
                io.emit('roomsUpdated');
            } catch (err) {
                console.error('[Socket kickOpponent Error]:', err);
            }
        });

        // 10. Yêu cầu đánh lại (Rematch)
        socket.on('requestRematch', ({ roomCode }) => {
            const targetRoom = `room_${roomCode}`;
            socket.to(targetRoom).emit('rematchRequested', {
                requesterId: socket.dbUserId,
                requesterName: socket.userName || 'Đối thủ'
            });
        });

        // 11. Từ chối đánh lại
        socket.on('declineRematch', ({ roomCode }) => {
            const targetRoom = `room_${roomCode}`;
            socket.to(targetRoom).emit('rematchDeclined', {
                declinerName: socket.userName || 'Đối thủ'
            });
        });

        // 12. Chấp nhận đánh lại (Bắt đầu ván mới)
        socket.on('acceptRematch', async ({ roomCode }) => {
            try {
                const targetRoom = `room_${roomCode}`;
                const [rooms] = await db.execute('SELECT * FROM Rooms WHERE room_code = ?', [roomCode]);
                if (!rooms || rooms.length === 0) return;
                const room = rooms[0];

                const [oldGames] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [room.id]);
                const oldGame = oldGames && oldGames[0];
                if (!oldGame) return;

                const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                
                // Đổi bên khi tái đấu để công bằng
                const newWhiteId = oldGame.black_player_id || oldGame.white_player_id;
                const newBlackId = (Number(newWhiteId) === Number(oldGame.black_player_id)) ? oldGame.white_player_id : oldGame.black_player_id;

                const [insGame] = await db.execute(
                    'INSERT INTO Games (room_id, white_player_id, black_player_id, current_fen, move_history, status, result) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [room.id, newWhiteId, newBlackId, initialFen, '[]', 'playing', 'none']
                );

                await db.execute("UPDATE Rooms SET status = 'playing' WHERE id = ?", [room.id]);

                if (!roomStagingState[targetRoom]) roomStagingState[targetRoom] = {};
                roomStagingState[targetRoom].isGameStarted = true;
                roomStagingState[targetRoom].opponentReady = true;

                // Cập nhật lại userRole của các socket
                const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
                let whiteName = 'Quân Trắng';
                let blackName = 'Quân Đen';

                if (roomSockets) {
                    for (const sId of roomSockets) {
                        const s = io.sockets.sockets.get(sId);
                        if (s) {
                            if (Number(s.dbUserId) === Number(newWhiteId)) {
                                s.userRole = 'white';
                                whiteName = s.userName;
                            } else if (Number(s.dbUserId) === Number(newBlackId)) {
                                s.userRole = 'black';
                                blackName = s.userName;
                            }
                        }
                    }
                }

                io.to(targetRoom).emit('rematchAccepted', {
                    newGameId: insGame.insertId,
                    whitePlayerId: newWhiteId,
                    blackPlayerId: newBlackId,
                    whitePlayerName: whiteName,
                    blackPlayerName: blackName,
                    fen: initialFen,
                    history: []
                });
                startRoomTurnTimer(io, targetRoom, roomCode, insGame.insertId);
            } catch (err) {
                console.error('[Socket acceptRematch Error]:', err);
            }
        });

        // Hàm xử lý khi người chơi thoát phòng hoặc ngắt kết nối
        async function handlePlayerLeave(socket, isExplicit = false) {
            if (!currentRoom || !currentUser) return;
            const targetRoom = currentRoom;
            const rCode = targetRoom.replace('room_', '');
            const userId = socket.dbUserId || currentUser.id;
            const username = socket.userName || currentUser.username;
            const role = socket.userRole;

            clearRoomTurnTimer(targetRoom);

            console.log(`[Socket] ${username} (${role}) rời phòng ${targetRoom} (Chủ động bấm nút: ${isExplicit})`);

            try {
                const [rooms] = await db.execute('SELECT * FROM Rooms WHERE room_code = ?', [rCode]);
                if (!rooms || rooms.length === 0) return;
                const room = rooms[0];

                const [games] = await db.execute("SELECT * FROM Games WHERE room_id = ? AND status = 'playing' ORDER BY id DESC", [room.id]);
                if (!games || games.length === 0) return;
                const game = games[0];

                // Nếu ván cờ chưa có đối thủ (chỉ mới có 1 người đang chờ) hoặc trận đấu chưa bắt đầu (đang trong sảnh chờ)
                let movesHistory = [];
                try { movesHistory = JSON.parse(game.move_history || '[]'); } catch (e) { movesHistory = []; }
                const isMatchActive = Boolean(roomStagingState[targetRoom]?.isGameStarted) || movesHistory.length > 0;

                if (!game.black_player_id || !isMatchActive) {
                    if (role === 'black' || Number(game.black_player_id) === Number(userId)) {
                        await db.execute("UPDATE Games SET black_player_id = NULL, status = 'waiting' WHERE id = ?", [game.id]);
                        await db.execute("UPDATE Rooms SET status = 'waiting' WHERE id = ?", [room.id]);
                        if (roomStagingState[targetRoom]) {
                            roomStagingState[targetRoom].opponentReady = false;
                            roomStagingState[targetRoom].isGameStarted = false;
                            roomStagingState[targetRoom].blackPlayerId = null;
                            roomStagingState[targetRoom].blackPlayerName = null;
                        }
                    }

                    socket.to(targetRoom).emit('playerLeft', {
                        userId,
                        username,
                        message: `${username} đã rời phòng`
                    });
                    io.to(targetRoom).emit('opponentLeft', {
                        userId,
                        username,
                        message: `${username} đã rời phòng`
                    });

                    // Nếu người duy nhất đang chờ cũng đã thoát -> Đóng phòng để biến mất khỏi danh sách chờ
                    setTimeout(async () => {
                        const remSockets = io.sockets.adapter.rooms.get(targetRoom);
                        if (!remSockets || remSockets.size === 0) {
                            await db.execute("UPDATE Rooms SET status = 'finished' WHERE id = ?", [room.id]);
                            console.log(`[Phòng trống] ${targetRoom} không còn ai ở lại -> Đã đóng phòng.`);
                        }
                        io.emit('roomsUpdated');
                    }, 500);
                    return;
                }

                // Kiểm tra xem người rời phòng có phải là kỳ thủ chính (Trắng hoặc Đen) không
                const isWhite = role === 'white' || Number(game.white_player_id) === Number(userId);
                const isBlack = role === 'black' || Number(game.black_player_id) === Number(userId);

                if (!isWhite && !isBlack) {
                    socket.to(targetRoom).emit('playerLeft', {
                        userId,
                        username,
                        message: `${username} đã rời phòng`
                    });
                    return;
                }

                const gameResult = isWhite ? 'black_win' : 'white_win';
                const leaverTitle = isWhite ? 'Bên Trắng' : 'Bên Đen';
                const winnerTitle = isWhite ? 'Bên Đen' : 'Bên Trắng';

                const doForfeit = async (reason) => {
                    const [currG] = await db.execute("SELECT status FROM Games WHERE id = ?", [game.id]);
                    if (!currG || currG.length === 0 || currG[0].status !== 'playing') return;

                    await db.execute(
                        "UPDATE Games SET status = 'finished', result = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?",
                        [gameResult, game.id]
                    );
                    await db.execute(
                        "UPDATE Rooms SET status = 'finished' WHERE id = ?",
                        [room.id]
                    );

                    console.log(`[Xử Thắng Thua] ${targetRoom}: ${reason}`);

                    io.to(targetRoom).emit('gameOver', {
                        result: gameResult,
                        reason,
                        forfeitBy: username
                    });
                };

                if (isExplicit) {
                    // 1. Chủ động bấm nút "Rời phòng" khi trận đấu đang diễn ra -> XỬ THUA NGAY LẬP TỨC
                    await doForfeit(`${leaverTitle} (${username}) đã thoát phòng. ${winnerTitle} giành CHIẾN THẮNG!`);
                } else {
                    // 2. Mất kết nối / Đóng tab đột ngột -> Đợi 15 giây trước khi xử thua
                    socket.to(targetRoom).emit('playerDisconnectedWaiting', {
                        username,
                        seconds: 15,
                        message: `Đối thủ (${username}) đã mất kết nối. Đang chờ 15 giây trước khi xử thua...`
                    });

                    const timerKey = `forfeit_${targetRoom}_${userId}`;
                    clearTimeout(disconnectTimers[timerKey]);
                    disconnectTimers[timerKey] = setTimeout(async () => {
                        delete disconnectTimers[timerKey];

                        // Kiểm tra xem socket người này đã quay lại phòng chưa
                        const roomSockets = io.sockets.adapter.rooms.get(targetRoom);
                        let reconnected = false;
                        if (roomSockets) {
                            for (const sId of roomSockets) {
                                const s = io.sockets.sockets.get(sId);
                                if (s && (s.userRole === role || Number(s.dbUserId) === Number(userId))) {
                                    reconnected = true;
                                    break;
                                }
                            }
                        }

                        if (!reconnected) {
                            await doForfeit(`${leaverTitle} (${username}) đã ngắt kết nối quá 15 giây và bị xử THUA. ${winnerTitle} giành CHIẾN THẮNG!`);
                        }
                    }, 15000);
                }

                // Luôn kiểm tra nếu phòng không còn ai ở lại (kể cả sau khi xử thua hoặc rời phòng)
                setTimeout(async () => {
                    const remSockets = io.sockets.adapter.rooms.get(targetRoom);
                    if (!remSockets || remSockets.size === 0) {
                        await db.execute("UPDATE Rooms SET status = 'finished' WHERE room_code = ?", [rCode]);
                        console.log(`[Phòng trống] ${targetRoom} không còn ai ở trong -> Đã tự động đóng phòng.`);
                        io.emit('roomsUpdated');
                    }
                }, 1000);
            } catch (err) {
                console.error('[handlePlayerLeave Error]:', err);
            }
        }

        // 7. Người chơi chủ động rời phòng (bấm nút "Rời phòng")
        socket.on('leaveRoom', async () => {
            await handlePlayerLeave(socket, true);
        });

        // 8. Ngắt kết nối socket
        socket.on('disconnect', async () => {
            await handlePlayerLeave(socket, false);
        });
    });

    // Định kỳ dọn dẹp các phòng waiting không có ai kết nối (chạy mỗi 10 giây)
    setInterval(async () => {
        try {
            const [waitingRooms] = await db.execute("SELECT id, room_code FROM Rooms WHERE status = 'waiting'");
            if (waitingRooms && waitingRooms.length > 0) {
                for (const wr of waitingRooms) {
                    const rSockets = io.sockets.adapter.rooms.get(`room_${wr.room_code}`);
                    if (!rSockets || rSockets.size === 0) {
                        await db.execute("UPDATE Rooms SET status = 'finished' WHERE id = ?", [wr.id]);
                        console.log(`[Tự động dọn phòng] Phòng ${wr.room_code} không còn ai ở trong -> Đã đóng.`);
                    }
                }
            }
        } catch (e) {}
    }, 10000);
};
