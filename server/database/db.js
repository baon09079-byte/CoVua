/**
 * Database Adapter: Hỗ trợ tự động Microsoft SQL Server, MySQL và Fallback
 * Tự động nhận diện SQL Server đang chạy trên máy (Windows Auth) hoặc MySQL
 */

const path = require('path');
require('dotenv').config();

let dbType = 'none'; // 'mssql', 'mysql', 'fallback'
let mssqlDriver = null;
let mssqlConnStr = null;
let mysqlPool = null;

// Thử nạp driver msnodesqlv8 cho Microsoft SQL Server
try {
    mssqlDriver = require('msnodesqlv8');
} catch (e) {
    mssqlDriver = null;
}

// Thử nạp driver mysql2 cho MySQL
let mysql = null;
try {
    mysql = require('mysql2/promise');
} catch (e) {
    mysql = null;
}

// Dữ liệu mẫu ban đầu cho Fallback
const fallbackData = {
    users: [
        {
            id: 1,
            username: 'nguyenvana',
            email: 'nguyenvana@gmail.com',
            password_hash: '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC',
            created_at: new Date('2026-10-01T10:00:00')
        },
        {
            id: 2,
            username: 'tranthib',
            email: 'tranthib@gmail.com',
            password_hash: '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC',
            created_at: new Date('2026-10-02T11:30:00')
        },
        {
            id: 3,
            username: 'lequanc',
            email: 'lequanc@gmail.com',
            password_hash: '$2b$10$8p3.kHN/79g9MuGpBAmHQOB.jRkHzl3f5Y3cwBdr5/6BYzlqUemnC',
            created_at: new Date('2026-10-03T14:15:00')
        }
    ],
    rooms: [
        { id: 1, room_code: 'CHESS1', host_user_id: 1, status: 'finished', created_at: new Date() },
        { id: 2, room_code: 'CHESS2', host_user_id: 2, status: 'finished', created_at: new Date() }
    ],
    games: [
        {
            id: 1,
            room_id: 1,
            white_player_id: 1,
            black_player_id: 2,
            current_fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
            move_history: '["e4","e5","Nf3","Nc6","Bc4","Nf6"]',
            status: 'finished',
            result: 'white_win',
            started_at: new Date(),
            ended_at: new Date()
        }
    ],
    chatMessages: [
        { id: 1, room_id: 1, sender_id: 1, message: 'Chào bạn!', created_at: new Date() }
    ]
};

// 1. Kiểm tra kết nối Microsoft SQL Server
async function tryConnectMssql() {
    if (!mssqlDriver) return false;

    const connectionStrings = [
        'server=.;Database=CoVua;Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server}',
        'server=.;Database=CoVua;Trusted_Connection=Yes;Driver={ODBC Driver 18 for SQL Server};TrustServerCertificate=Yes',
        'server=.;Database=CoVua;Trusted_Connection=Yes;Driver={SQL Server}',
        'server=(local);Database=CoVua;Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server}',
        'server=(local);Database=CoVua;Trusted_Connection=Yes;Driver={SQL Server}',
        'server=localhost;Database=CoVua;Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server}',
        'server=localhost;Database=CoVua;Trusted_Connection=Yes;Driver={ODBC Driver 18 for SQL Server};TrustServerCertificate=Yes',
        'server=localhost;Database=CoVua;Trusted_Connection=Yes;Driver={SQL Server}',
        'server=.;Database=chess_online;Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server}',
        'server=.;Database=chess_online;Trusted_Connection=Yes;Driver={ODBC Driver 18 for SQL Server};TrustServerCertificate=Yes',
        'server=.;Database=chess_online;Trusted_Connection=Yes;Driver={SQL Server}',
        'server=localhost;Database=chess_online;Trusted_Connection=Yes;Driver={ODBC Driver 17 for SQL Server}',
        'server=localhost;Database=chess_online;Trusted_Connection=Yes;Driver={ODBC Driver 18 for SQL Server};TrustServerCertificate=Yes',
        'server=localhost;Database=chess_online;Trusted_Connection=Yes;Driver={SQL Server}'
    ];

    for (const cs of connectionStrings) {
        try {
            const res = await mssqlDriver.promises.query(cs, 'SELECT 1 AS ok');
            if (res && res.first && res.first.length > 0) {
                mssqlConnStr = cs;
                dbType = 'mssql';
                const dbName = cs.includes('Database=CoVua') ? 'CoVua' : 'chess_online';
                console.log(`==============================================================`);
                console.log(`[CSDL THÀNH CÔNG] ĐÃ KẾT NỐI TRỰC TIẾP TỚI MICROSOFT SQL SERVER!`);
                console.log(`   - CSDL: ${dbName} trên localhost (Windows Authentication)`);
                console.log(`   - Chuỗi kết nối: ${cs}`);
                console.log(`==============================================================`);
                return true;
            }
        } catch (e) {
            // thử tiếp
        }
    }
    return false;
}

// 2. Kiểm tra kết nối MySQL
async function tryConnectMysql() {
    if (!mysql) return false;
    try {
        const pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASS || '',
            database: process.env.DB_NAME || 'chess_online',
            waitForConnections: true,
            connectionLimit: 10
        });
        const [rows] = await pool.execute('SELECT 1 as ok');
        if (rows && rows.length > 0) {
            mysqlPool = pool;
            dbType = 'mysql';
            console.log(`==============================================================`);
            console.log(`[CSDL THÀNH CÔNG] ĐÃ KẾT NỐI TỚI MYSQL DATABASE: chess_online!`);
            console.log(`==============================================================`);
            return true;
        }
    } catch (e) {
        // bỏ qua
    }
    return false;
}

// Tự động dò kết nối khi khởi động có Promise đảm bảo không bị race condition
let initPromise = null;
function ensureDbInit() {
    if (!initPromise) {
        initPromise = (async () => {
            const isMssql = await tryConnectMssql();
            if (!isMssql) {
                const isMysql = await tryConnectMysql();
                if (!isMysql) {
                    dbType = 'fallback';
                    console.warn(`[CSDL THÔNG BÁO] Đang sử dụng CSDL Dự phòng In-Memory.`);
                }
            }
        })();
    }
    return initPromise;
}

ensureDbInit();

// Xử lý thực thi câu SQL cho Microsoft SQL Server
async function executeMssql(sql, params = []) {
    let querySql = sql;
    const isInsert = /^\s*INSERT\s+INTO/i.test(sql);

    // Chuyển đổi nháy kép thành nháy đơn chuẩn SQL Server cho giá trị chuỗi
    querySql = querySql.replace(/"(playing|finished|waiting|draw|white_win|black_win|none)"/gi, "'$1'");

    // Chuyển LIMIT 1 -> TOP 1 cho SQL Server nếu có
    if (/LIMIT\s+1/i.test(querySql) && !/TOP\s+/i.test(querySql)) {
        querySql = querySql.replace(/SELECT\s+/i, 'SELECT TOP 1 ').replace(/LIMIT\s+1/i, '');
    }

    if (isInsert && !/SELECT.*SCOPE_IDENTITY/i.test(querySql)) {
        querySql = `${querySql}; SELECT SCOPE_IDENTITY() AS insertId;`;
    }

    const res = await mssqlDriver.promises.query(mssqlConnStr, querySql, params);

    if (isInsert) {
        const insertId = res.first && res.first[0] ? res.first[0].insertId : 1;
        return [{ insertId: Number(insertId), affectedRows: 1 }, []];
    }

    const rows = res.first || [];
    return [rows, []];
}

// Xử lý Fallback
function executeFallback(sql, params = []) {
    const cleanSql = sql.replace(/\s+/g, ' ').trim();

    // 1. Users
    if (/SELECT.*FROM Users WHERE username = \? OR email = \?/i.test(cleanSql)) {
        const [username, email] = params;
        const rows = fallbackData.users.filter(u => u.username === username || u.email === email);
        return [rows, []];
    }
    if (/SELECT.*FROM Users WHERE username = \?/i.test(cleanSql)) {
        const [username] = params;
        const rows = fallbackData.users.filter(u => u.username === username);
        return [rows, []];
    }
    if (/SELECT.*FROM Users WHERE id = \?/i.test(cleanSql)) {
        const [id] = params;
        const rows = fallbackData.users.filter(u => u.id === Number(id));
        return [rows, []];
    }
    if (/INSERT INTO Users/i.test(cleanSql)) {
        const [username, email, password_hash] = params;
        const newId = fallbackData.users.length > 0 ? Math.max(...fallbackData.users.map(u => u.id)) + 1 : 1;
        fallbackData.users.push({ id: newId, username, email, password_hash, created_at: new Date() });
        return [{ insertId: newId, affectedRows: 1 }, []];
    }
    if (/UPDATE Users SET username/i.test(cleanSql)) {
        const [username, id] = params;
        const user = fallbackData.users.find(u => u.id === Number(id));
        if (user) user.username = username;
        return [{ affectedRows: 1 }, []];
    }

    // 2. Rooms
    if (/INSERT INTO Rooms/i.test(cleanSql)) {
        const [roomCode, userId, status] = params;
        const newId = fallbackData.rooms.length > 0 ? Math.max(...fallbackData.rooms.map(r => r.id)) + 1 : 1;
        fallbackData.rooms.push({ id: newId, room_code: roomCode, host_user_id: Number(userId), status: status || 'waiting', created_at: new Date() });
        return [{ insertId: newId, affectedRows: 1 }, []];
    }
    if (/SELECT.*FROM Rooms WHERE room_code = \?/i.test(cleanSql)) {
        const [roomCode] = params;
        return [fallbackData.rooms.filter(r => r.room_code === roomCode), []];
    }
    if (/SELECT.*FROM Rooms WHERE id = \?/i.test(cleanSql)) {
        const [id] = params;
        return [fallbackData.rooms.filter(r => r.id === Number(id)), []];
    }
    if (/UPDATE Rooms SET status/i.test(cleanSql)) {
        const isParam = /status\s*=\s*\?/i.test(cleanSql);
        const status = isParam ? params[0] : (cleanSql.includes('"finished"') ? 'finished' : 'playing');
        const id = isParam ? params[1] : params[0];
        const room = fallbackData.rooms.find(r => r.id === Number(id));
        if (room) room.status = status;
        return [{ affectedRows: 1 }, []];
    }
    if (/SELECT.*FROM Rooms/i.test(cleanSql) && /status = 'waiting'/i.test(cleanSql)) {
        const rows = fallbackData.rooms.filter(r => r.status === 'waiting').map(r => {
            const host = fallbackData.users.find(u => u.id === r.host_user_id);
            return { ...r, host_name: host ? host.username : 'Người dùng' };
        });
        return [rows, []];
    }

    // 3. Games
    if (/INSERT INTO Games/i.test(cleanSql)) {
        const newId = fallbackData.games.length > 0 ? Math.max(...fallbackData.games.map(g => g.id)) + 1 : 1;
        fallbackData.games.push({
            id: newId,
            room_id: Number(params[0]),
            white_player_id: Number(params[1]),
            black_player_id: params[2] ? Number(params[2]) : null,
            current_fen: params[3] || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            move_history: typeof params[4] === 'string' ? params[4] : '[]',
            status: params[5] || 'playing',
            result: params[6] || 'none',
            started_at: new Date(),
            ended_at: null
        });
        return [{ insertId: newId, affectedRows: 1 }, []];
    }
    if (/UPDATE Games SET black_player_id/i.test(cleanSql)) {
        const [blackPlayerId, status, id] = params;
        const game = fallbackData.games.find(g => g.id === Number(id));
        if (game) {
            game.black_player_id = Number(blackPlayerId);
            game.status = status;
        }
        return [{ affectedRows: 1 }, []];
    }
    if (/SELECT.*FROM Games WHERE room_id = \? AND status = "playing"/i.test(cleanSql)) {
        const [roomId] = params;
        return [fallbackData.games.filter(g => g.room_id === Number(roomId) && g.status === 'playing'), []];
    }
    if (/SELECT.*FROM Games WHERE room_id = \?/i.test(cleanSql)) {
        const [roomId] = params;
        return [fallbackData.games.filter(g => g.room_id === Number(roomId)).sort((a, b) => b.id - a.id), []];
    }
    if (/FROM Games g.*WHERE g\.id = \?/i.test(cleanSql)) {
        const id = Number(params[0]);
        const game = fallbackData.games.find(g => g.id === id);
        if (!game) return [[], []];
        const white = fallbackData.users.find(u => u.id === game.white_player_id);
        const black = fallbackData.users.find(u => u.id === game.black_player_id);
        return [[{ ...game, white_player_name: white ? white.username : 'Ẩn danh', black_player_name: black ? black.username : 'Ẩn danh' }], []];
    }
    if (/FROM Games g/i.test(cleanSql) && /ORDER BY g\.started_at DESC/i.test(cleanSql)) {
        const userId = Number(params[0]);
        const rows = fallbackData.games.filter(g => g.white_player_id === userId || g.black_player_id === userId).map(g => {
            const white = fallbackData.users.find(u => u.id === g.white_player_id);
            const black = fallbackData.users.find(u => u.id === g.black_player_id);
            return { ...g, white_player_name: white ? white.username : 'Ẩn danh', black_player_name: black ? black.username : 'Ẩn danh' };
        }).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
        return [rows, []];
    }
    if (/UPDATE Games SET current_fen = \?, move_history = \? WHERE id = \?/i.test(cleanSql)) {
        const [fen, history, id] = params;
        const game = fallbackData.games.find(g => g.id === Number(id));
        if (game) {
            game.current_fen = fen;
            game.move_history = history;
        }
        return [{ affectedRows: 1 }, []];
    }
    if (/UPDATE Games SET status.*result/i.test(cleanSql)) {
        const isResultParam = /result\s*=\s*\?/i.test(cleanSql);
        const result = isResultParam ? params[0] : (cleanSql.includes('"draw"') ? 'draw' : 'none');
        const id = isResultParam ? params[1] : params[0];
        const game = fallbackData.games.find(g => g.id === Number(id));
        if (game) {
            game.status = 'finished';
            game.result = result;
            game.ended_at = new Date();
        }
        return [{ affectedRows: 1 }, []];
    }
    if (/SELECT.*COUNT\(\*\) as total_games.*FROM Games/i.test(cleanSql)) {
        const userId = Number(params[0]);
        const userGames = fallbackData.games.filter(g => (g.white_player_id === userId || g.black_player_id === userId) && g.status === 'finished');
        let wins = 0, losses = 0, draws = 0;
        userGames.forEach(g => {
            if (g.result === 'draw') draws++;
            else if ((g.white_player_id === userId && g.result === 'white_win') || (g.black_player_id === userId && g.result === 'black_win')) wins++;
            else losses++;
        });
        return [[{ total_games: userGames.length, wins, losses, draws }], []];
    }

    // 4. Chat
    if (/INSERT INTO ChatMessages/i.test(cleanSql)) {
        const [roomId, senderId, message] = params;
        const newId = fallbackData.chatMessages.length > 0 ? Math.max(...fallbackData.chatMessages.map(c => c.id)) + 1 : 1;
        fallbackData.chatMessages.push({ id: newId, room_id: Number(roomId), sender_id: Number(senderId), message, created_at: new Date() });
        return [{ insertId: newId, affectedRows: 1 }, []];
    }
    if (/FROM ChatMessages/i.test(cleanSql)) {
        const roomId = Number(params[0]);
        const rows = fallbackData.chatMessages.filter(c => c.room_id === roomId).map(c => {
            const user = fallbackData.users.find(u => u.id === c.sender_id);
            return { ...c, username: user ? user.username : 'Khách' };
        }).sort((a, b) => a.id - b.id);
        return [rows, []];
    }

    return [[], []];
}

// Wrapper thống nhất
const db = {
    async execute(sql, params = []) {
        await ensureDbInit();
        if (dbType === 'mssql' && mssqlConnStr) {
            try {
                return await executeMssql(sql, params);
            } catch (err) {
                console.error('[SQL Server Error]:', err.message);
                return executeFallback(sql, params);
            }
        }
        if (dbType === 'mysql' && mysqlPool) {
            try {
                return await mysqlPool.execute(sql, params);
            } catch (err) {
                console.error('[MySQL Error]:', err.message);
                return executeFallback(sql, params);
            }
        }
        return executeFallback(sql, params);
    },

    async query(sql, params = []) {
        return this.execute(sql, params);
    }
};

module.exports = db;
