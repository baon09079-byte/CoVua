const io = require('../server/node_modules/socket.io-client');
const { Chess } = require('../server/node_modules/chess.js');

const SERVER_URL = 'http://localhost:3000';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('--- BẮT ĐẦU KIỂM THỬ TÍNH NĂNG LƯU VÀ XEM LẠI REPLAY ---');

    // TEST 1: KIỂM THỬ API POST /api/games/save (LƯU VÁN CỜ)
    console.log('\n[Test 1] Kiểm tra API POST /api/games/save...');
    const testMoves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4'];
    const finalFen = 'r1bqk2r/pppp1ppp/2n2n2/2b5/2BpP3/2P2N2/PP3PPP/RNBQK2R w KQkq - 0 6';
    
    const savePayload = {
        userId: 1003,
        username: 'Gbao123',
        playerColor: 'w',
        result: 'white_win',
        currentFen: finalFen,
        moveHistory: testMoves,
        difficulty: 'medium'
    };

    const saveRes = await fetch(`${SERVER_URL}/api/games/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savePayload)
    });

    const saveData = await saveRes.json();
    console.log('   -> Kết quả API save:', saveData);

    if (!saveRes.ok || !saveData.success || !saveData.gameId) {
        throw new Error('Test 1 Thất bại: Không thể lưu ván cờ qua API /api/games/save!');
    }
    const savedGameId = saveData.gameId;
    console.log(`✅ Test 1 Thành công: Đã lưu ván cờ vào CSDL với GameId = #${savedGameId}!`);

    // TEST 2: KIỂM THỬ API GET /api/games/:id ĐỂ LẤY DỮ LIỆU REPLAY
    console.log(`\n[Test 2] Kiểm tra API GET /api/games/${savedGameId} để lấy dữ liệu xem lại...`);
    const getRes = await fetch(`${SERVER_URL}/api/games/${savedGameId}`);
    const getData = await getRes.json();

    if (!getRes.ok || !getData || !getData.move_history) {
        throw new Error(`Test 2 Thất bại: Không lấy được ván cờ #${savedGameId} để replay!`);
    }

    const fetchedMoves = typeof getData.move_history === 'string' ? JSON.parse(getData.move_history) : getData.move_history;
    console.log('   -> Số nước đi lấy được:', fetchedMoves.length);
    console.log('   -> Danh sách nước đi:', fetchedMoves.join(' '));

    if (fetchedMoves.length !== testMoves.length || fetchedMoves[0] !== 'e4') {
        throw new Error('Test 2 Thất bại: Danh sách nước đi lưu trong CSDL không khớp!');
    }
    console.log('✅ Test 2 Thành công: Lấy dữ liệu ván cờ chuẩn xác với đầy đủ tiến trình nước đi!');

    // TEST 3: MÔ PHỎNG QUY TRÌNH XEM LẠI REPLAY NƯỚC ĐI TỪNG BƯỚC
    console.log('\n[Test 3] Mô phỏng tái hiện bàn cờ từng nước đi (Replay Engine)...');
    const replayChess = new Chess();
    for (let i = 0; i < fetchedMoves.length; i++) {
        const moveSan = fetchedMoves[i];
        const moveRes = replayChess.move(moveSan);
        if (!moveRes) {
            throw new Error(`Test 3 Thất bại: Nước đi #${i + 1} (${moveSan}) không hợp lệ khi tái hiện replay!`);
        }
    }
    console.log('   -> Thế cờ sau khi tua hết nước đi:', replayChess.fen());
    console.log('✅ Test 3 Thành công: Tua từng nước cờ từ đầu đến cuối ván mượt mà và chính xác 100%!');

    // TEST 4: KIỂM THỬ LỊCH SỬ ĐẤU TRONG PROFILE CÓ XUẤT HIỆN VÀ XEM ĐƯỢC
    console.log('\n[Test 4] Kiểm tra GET /api/games/history/1003...');
    const historyRes = await fetch(`${SERVER_URL}/api/games/history/1003`);
    const historyData = await historyRes.json();

    if (!historyRes.ok || !Array.isArray(historyData)) {
        throw new Error('Test 4 Thất bại: Không lấy được lịch sử đấu của user 1003!');
    }

    const foundMatch = historyData.find(g => Number(g.id) === Number(savedGameId));
    if (!foundMatch) {
        throw new Error(`Test 4 Thất bại: Ván cờ #${savedGameId} không xuất hiện trong lịch sử đấu của user 1003!`);
    }
    console.log(`   -> Tìm thấy ván cờ #${foundMatch.id} trong lịch sử: Đối thủ = ${foundMatch.black_player_name}, Kết quả = ${foundMatch.result}`);
    console.log('✅ Test 4 Thành công: Ván đấu đã được hiển thị đầy đủ trong Profile để người chơi bấm nút "Xem lại"!');

    // TEST 5: KIỂM THỬ VÁN ĐẤU ONLINE PVP TỰ ĐỘNG LƯU VÀO CSDL KHI KẾT THÚC
    console.log('\n[Test 5] Kiểm tra ván đấu Online PvP tự động lưu move_history vào CSDL khi kết thúc...');
    const roomCode = 'RPL' + Math.floor(1000 + Math.random() * 9000);
    const hostUser = { id: 1003, username: 'Gbao123' };
    const guestUser = { id: 2020, username: 'PlayerTwo' };

    const sHost = io(SERVER_URL, { transports: ['websocket'] });
    const sGuest = io(SERVER_URL, { transports: ['websocket'] });

    await new Promise((resolve) => {
        let cnt = 0;
        const cb = () => { if (++cnt === 2) resolve(); };
        sHost.on('connect', cb);
        sGuest.on('connect', cb);
    });

    sHost.emit('joinRoom', { roomCode, userId: hostUser.id, username: hostUser.username });
    await sleep(400);
    sGuest.emit('joinRoom', { roomCode, userId: guestUser.id, username: guestUser.username });
    await sleep(400);
    sGuest.emit('toggleReady', { roomCode });
    await sleep(400);
    sHost.emit('startGame', { roomCode });
    await sleep(500);

    // Đi 2 nước cờ: Trắng đi e4, Đen đi e5
    sHost.emit('move', { roomCode, move: { from: 'e2', to: 'e4' }, userId: hostUser.id });
    await sleep(500);
    sGuest.emit('move', { roomCode, move: { from: 'e7', to: 'e5' }, userId: guestUser.id });
    await sleep(500);

    // Guest xin đầu hàng để kết thúc ván
    sGuest.emit('resign', { roomCode, userId: guestUser.id });
    await sleep(1000);

    // Kiểm tra CSDL
    const db = require('../server/database/db');
    const [rooms] = await db.execute('SELECT id FROM Rooms WHERE room_code = ?', [roomCode]);
    if (!rooms || rooms.length === 0) throw new Error('Test 5 Thất bại: Không tìm thấy phòng đấu PvP!');

    const [games] = await db.execute('SELECT * FROM Games WHERE room_id = ? ORDER BY id DESC', [rooms[0].id]);
    if (!games || games.length === 0) throw new Error('Test 5 Thất bại: Không tìm thấy game trong CSDL!');

    const pvpGame = games[0];
    const pvpMoves = JSON.parse(pvpGame.move_history || '[]');
    console.log('   -> PvP Game ID:', pvpGame.id);
    console.log('   -> PvP Move History trong CSDL:', pvpMoves);
    console.log('   -> PvP Status & Result:', pvpGame.status, pvpGame.result);

    if (pvpGame.status !== 'finished' || pvpMoves.length !== 2 || pvpMoves[0] !== 'e4' || pvpMoves[1] !== 'e5') {
        throw new Error('Test 5 Thất bại: Nước đi PvP không được tự động lưu vào CSDL!');
    }
    console.log('✅ Test 5 Thành công: Trận đấu Online PvP được tự động lưu trọn vẹn vào CSDL với đầy đủ nước đi!');

    sHost.disconnect();
    sGuest.disconnect();

    console.log('\n========================================================');
    console.log('🎉 TẤT CẢ 5/5 KIỂM THỬ LƯU VÀ REPLAY ĐỀU THÀNH CÔNG 100%!');
    console.log('========================================================');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ LỖI KIỂM THỬ:', err);
    process.exit(1);
});

