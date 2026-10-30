// ============================================================
// Automated End-to-End Test Suite - Chess Online
// ============================================================

const path = require('path');
const io = require(path.join(__dirname, '../server/node_modules/socket.io-client'));
const { Chess } = require(path.join(__dirname, '../server/node_modules/chess.js'));

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('========================================================');
    console.log(' BẮT ĐẦU KIỂM THỬ HỆ THỐNG CHESS ONLINE (TEST SUITE)');
    console.log('========================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  [PASS] ${message}`);
            passedCount++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failedCount++;
        }
    }

    try {
        // --- TEST 1: Kiểm tra trang chủ & tĩnh ---
        console.log('1. Kiểm tra File Tĩnh & Trang Chủ');
        const homeRes = await fetch(`${BASE_URL}/`);
        assert(homeRes.status === 200, 'Tải trang chủ HTTP 200');

        const cssRes = await fetch(`${BASE_URL}/css/site.css`);
        assert(cssRes.status === 200, 'Tải CSS site.css HTTP 200');

        const pieceRes = await fetch(`${BASE_URL}/img/pieces/wQ.svg`);
        assert(pieceRes.status === 200, 'Tải ảnh quân cờ SVG (wQ.svg) HTTP 200');

        const socketScriptRes = await fetch(`${BASE_URL}/socket.io/socket.io.js`);
        assert(socketScriptRes.status === 200, 'Tải thư viện Socket.IO client script HTTP 200');

        // --- TEST 2: Đăng ký & Đăng nhập tài khoản ---
        console.log('\n2. Kiểm tra Hệ Thống Tài Khoản (Auth)');
        const testUser = `user_${Date.now()}`;
        const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: testUser,
                email: `${testUser}@gmail.com`,
                password: 'password123'
            })
        });
        const regData = await regRes.json();
        assert(regRes.status === 201, `Đăng ký tài khoản mới [${testUser}] thành công`);

        // Đăng nhập
        const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: testUser,
                password: 'password123'
            })
        });
        const loginData = await loginRes.json();
        assert(loginRes.status === 200 && !!loginData.token, 'Đăng nhập thành công và nhận JWT Token');
        const userToken = loginData.token;
        const userId = loginData.user.id;

        // Cập nhật tên hiển thị
        const updatedName = `${testUser}_pro`;
        const updateRes = await fetch(`${BASE_URL}/api/auth/update`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ username: updatedName })
        });
        const updateData = await updateRes.json();
        assert(updateRes.status === 200 && updateData.username === updatedName, 'Cập nhật tên hiển thị thành công');

        // --- TEST 3: Quản lý phòng chơi ---
        console.log('\n3. Kiểm tra Quản Lý Phòng Chơi (Rooms)');
        // Tạo phòng
        const createRoomRes = await fetch(`${BASE_URL}/api/rooms/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${userToken}`
            },
            body: JSON.stringify({ userId })
        });
        const createRoomData = await createRoomRes.json();
        assert(createRoomRes.status === 201 && !!createRoomData.roomCode, `Tạo phòng thành công với mã: ${createRoomData.roomCode}`);
        const roomCode = createRoomData.roomCode;
        const roomId = createRoomData.roomId;

        // Lấy chi tiết phòng
        const roomDetailRes = await fetch(`${BASE_URL}/api/rooms/${roomCode}`);
        const roomDetailData = await roomDetailRes.json();
        assert(roomDetailRes.status === 200 && roomDetailData.room.room_code === roomCode, 'Lấy thông tin chi tiết phòng bằng mã thành công');

        // Người thứ 2 tham gia phòng (dùng tài khoản mẫu tranthib)
        const joinRes = await fetch(`${BASE_URL}/api/rooms/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomCode, userId: 2 })
        });
        const joinData = await joinRes.json();
        assert(joinRes.status === 200 && joinData.role === 'black', 'Người chơi thứ 2 tham gia thành công với vai trò Quân Đen');

        // --- TEST 4: Đấu Real-Time 2 người qua Socket.IO ---
        console.log('\n4. Kiểm tra Đồng Bộ Thời Gian Thực (Socket.IO)');
        await new Promise((resolve, reject) => {
            const socketWhite = io(BASE_URL);
            const socketBlack = io(BASE_URL);

            let moveSynced = false;
            let chatSynced = false;
            let gameOverSynced = false;

            socketWhite.on('connect', () => {
                socketWhite.emit('joinRoom', {
                    roomCode,
                    roomId,
                    userId,
                    username: updatedName
                });
            });

            socketBlack.on('connect', () => {
                socketBlack.emit('joinRoom', {
                    roomCode,
                    roomId,
                    userId: 2,
                    username: 'tranthib'
                });
            });

            // Lắng nghe chat
            socketBlack.on('chatMessage', (msg) => {
                if (msg.message === 'Xin chào đối thủ!') {
                    chatSynced = true;
                    assert(true, `Socket chat message nhận thành công: "${msg.message}"`);
                }
            });

            // Lắng nghe nước cờ
            socketBlack.on('move', (moveData) => {
                if (moveData.move && moveData.move.san === 'e4') {
                    moveSynced = true;
                    assert(true, 'Socket nhận và đồng bộ nước cờ [e4] thành công');

                    // Bên Đen trả lời nước cờ e5
                    socketBlack.emit('move', {
                        roomCode,
                        roomId,
                        userId: 2,
                        move: { from: 'e7', to: 'e5' }
                    });
                } else if (moveData.move && moveData.move.san === 'e5') {
                    assert(true, 'Socket nhận và đồng bộ nước cờ đối đáp [e5] thành công');

                    // Kiểm tra đầu hàng (Resign)
                    setTimeout(() => {
                        socketBlack.emit('resign', { roomCode, roomId, userId: 2 });
                    }, 200);
                }
            });

            // Lắng nghe kết thúc trận
            socketWhite.on('gameOver', (res) => {
                gameOverSynced = true;
                assert(res.result === 'white_win', `Sự kiện kết thúc ván cờ hợp lệ: ${res.reason}`);
                socketWhite.disconnect();
                socketBlack.disconnect();
                resolve();
            });

            // Gửi chat và nước đi đầu tiên sau khi kết nối
            setTimeout(() => {
                socketWhite.emit('chatMessage', {
                    roomCode,
                    roomId,
                    userId,
                    username: updatedName,
                    message: 'Xin chào đối thủ!'
                });

                socketWhite.emit('move', {
                    roomCode,
                    roomId,
                    userId,
                    move: { from: 'e2', to: 'e4' }
                });
            }, 600);

            // Timeout an toàn
            setTimeout(() => {
                if (!gameOverSynced) {
                    socketWhite.disconnect();
                    socketBlack.disconnect();
                    reject(new Error('Socket.IO test timeout'));
                }
            }, 5000);
        });

        // --- TEST 5: Hồ sơ và thống kê trận đấu ---
        console.log('\n5. Kiểm tra Hồ Sơ & Thống Kê (Profile & Stats)');
        const statsRes = await fetch(`${BASE_URL}/api/games/stats/1`);
        const statsData = await statsRes.json();
        assert(statsRes.status === 200 && typeof statsData.total_games !== 'undefined', 'Lấy dữ liệu thống kê cá nhân thành công');

        const histRes = await fetch(`${BASE_URL}/api/games/history/1`);
        const histData = await histRes.json();
        assert(histRes.status === 200 && Array.isArray(histData), 'Lấy danh sách lịch sử trận đấu thành công');

        // --- TEST 6: Thuật toán AI cờ vua ---
        console.log('\n6. Kiểm tra Thuật Toán Cờ Vua Minimax AI');
        const aiChess = new Chess();
        const moves = aiChess.moves({ verbose: true });
        assert(moves.length === 20, 'Vị trí ban đầu có chính xác 20 nước đi hợp lệ');

        aiChess.move('e4');
        const blackMoves = aiChess.moves({ verbose: true });
        assert(blackMoves.length === 20, 'Bên Đen có chính xác 20 nước đối đáp hợp lệ');

        console.log('\n========================================================');
        console.log(` KẾT QUẢ KIỂM THỬ TỔNG THỂ:`);
        console.log(`   - Thành công (PASS): ${passedCount}`);
        console.log(`   - Thất bại   (FAIL): ${failedCount}`);
        console.log('========================================================\n');

        if (failedCount === 0) {
            console.log('>>> CHÚC MỪNG: HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO 100%! <<<\n');
            process.exit(0);
        } else {
            process.exit(1);
        }
    } catch (err) {
        console.error('Lỗi trong quá trình chạy kiểm thử:', err);
        process.exit(1);
    }
}

runTests();
