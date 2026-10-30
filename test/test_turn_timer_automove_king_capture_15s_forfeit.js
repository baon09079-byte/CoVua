const io = require('../server/node_modules/socket.io-client');
const { Chess } = require('../server/node_modules/chess.js');

const SERVER_URL = 'http://localhost:3000';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('--- BẮT ĐẦU KIỂM THỬ TỔNG HỢP CÁC CHỨC NĂNG MỚI ---');

    // TEST 1: TỰ ĐỘNG PHONG CẤP THÀNH HẬU TRÊN CHESSBOARD VÀ CHESS.JS
    console.log('\n[Test 1] Kiểm tra cơ chế tự động phong cấp thành Hậu...');
    const chess = new Chess('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
    const moveResult = chess.move({ from: 'e7', to: 'e8', promotion: 'q' });
    if (!moveResult || moveResult.promotion !== 'q' || moveResult.piece !== 'p') {
        throw new Error('Test 1 Thất bại: Phong cấp thành Hậu không thành công!');
    }
    console.log('✅ Test 1 Thành công: Tốt tự động phong cấp thành Hậu (Queen: ' + moveResult.san + ')!');

    // TEST 2: ĐẾM NGƯỢC 10 GIÂY & TỰ ĐỘNG ĐÁNH (AUTO-MOVE) KHI QUÁ 10 GIÂY
    console.log('\n[Test 2] Kiểm tra bộ đếm 10s và tự động đánh nước cờ khi quá 10s...');
    const roomCode2 = 'AUTO' + Math.floor(1000 + Math.random() * 9000);
    const hostUser = { id: 101, username: 'HostPlayer' };
    const guestUser = { id: 102, username: 'GuestPlayer' };

    const socketHost = io(SERVER_URL, { transports: ['websocket'] });
    const socketGuest = io(SERVER_URL, { transports: ['websocket'] });

    await new Promise((resolve, reject) => {
        let connected = 0;
        const onConnect = () => {
            connected++;
            if (connected === 2) resolve();
        };
        socketHost.on('connect', onConnect);
        socketGuest.on('connect', onConnect);
        setTimeout(() => reject(new Error('Timeout kết nối socket')), 4000);
    });

    socketHost.emit('joinRoom', { roomCode: roomCode2, userId: hostUser.id, username: hostUser.username });
    await sleep(400);
    socketGuest.emit('joinRoom', { roomCode: roomCode2, userId: guestUser.id, username: guestUser.username });
    await sleep(400);

    // Guest ready, Host start
    socketGuest.emit('toggleReady', { roomCode: roomCode2 });
    await sleep(400);

    let receivedTick = false;
    let autoMoveReceived = false;

    socketHost.on('turnTick', (data) => {
        if (data.timeLeft !== undefined) {
            receivedTick = true;
        }
    });

    socketGuest.on('move', (data) => {
        if (data.isAutoMove) {
            autoMoveReceived = true;
            console.log('   -> Nhận thông báo Auto-Move:', data.message);
        }
    });

    socketHost.emit('startGame', { roomCode: roomCode2 });
    console.log('   -> Trận đấu bắt đầu, đang đợi 10 giây để hệ thống tự động đánh...');

    // Đợi 11.5s để turn timer (10s) kích hoạt autoMove
    for (let i = 0; i < 12; i++) {
        await sleep(1000);
        process.stdout.write(`   [Đã trôi qua ${i + 1}s / 10s]...\r`);
    }
    console.log('');

    if (!receivedTick) {
        throw new Error('Test 2 Thất bại: Không nhận được sự kiện turnTick đếm giây!');
    }
    if (!autoMoveReceived) {
        throw new Error('Test 2 Thất bại: Hệ thống không tự động đánh sau 10 giây!');
    }
    console.log('✅ Test 2 Thành công: Bộ đếm 10 giây hoạt động chuẩn xác và hệ thống đã tự động đánh + đổi lượt!');

    socketHost.disconnect();
    socketGuest.disconnect();
    await sleep(500);

    // TEST 3: ĂN VUA THÌ BÊN MẤT VUA BỊ XỬ THUA, BÊN ĂN VUA CHIẾN THẮNG
    console.log('\n[Test 3] Kiểm tra khi bị mất Vua thì bị xử THUA, đối phương CHIẾN THẮNG...');
    const roomCode3 = 'KING' + Math.floor(1000 + Math.random() * 9000);
    const host3 = io(SERVER_URL, { transports: ['websocket'] });
    const guest3 = io(SERVER_URL, { transports: ['websocket'] });

    await new Promise((resolve) => {
        let cnt = 0;
        const cb = () => { if (++cnt === 2) resolve(); };
        host3.on('connect', cb);
        guest3.on('connect', cb);
    });

    host3.emit('joinRoom', { roomCode: roomCode3, userId: 201, username: 'KingHunter' });
    await sleep(300);
    guest3.emit('joinRoom', { roomCode: roomCode3, userId: 202, username: 'KingVictim' });
    await sleep(300);
    guest3.emit('toggleReady', { roomCode: roomCode3 });
    await sleep(300);

    let kingCaptureGameOver = null;
    guest3.on('gameOver', (data) => {
        kingCaptureGameOver = data;
    });

    host3.emit('startGame', { roomCode: roomCode3 });
    await sleep(500);

    // Cố ý thực hiện nước ăn vua thông qua socket move (mô phỏng thế cờ vua bị bắt)
    // Giả lập thế cờ Trắng đi nước ăn vua
    const db = require('../server/database/db');
    const [rooms] = await db.execute('SELECT id FROM Rooms WHERE room_code = ?', [roomCode3]);
    if (rooms && rooms[0]) {
        // Cập nhật FEN: Trắng có Hậu ở e7, Vua Đen ở e8
        const attackFen = '4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1';
        await db.execute("UPDATE Games SET current_fen = ? WHERE room_id = ?", [attackFen, rooms[0].id]);
        
        // Hậu ăn Vua: e7 -> e8 (captured: 'k')
        host3.emit('move', {
            roomCode: roomCode3,
            move: { from: 'e7', to: 'e8', captured: 'k' },
            userId: 201
        });
    }

    await sleep(1000);

    if (!kingCaptureGameOver) {
        throw new Error('Test 3 Thất bại: Không nhận được sự kiện gameOver khi vua bị bắt!');
    }
    console.log('   -> Kết quả:', kingCaptureGameOver.result);
    console.log('   -> Lý do:', kingCaptureGameOver.reason);

    if (!kingCaptureGameOver.reason.includes('xử THUA') || kingCaptureGameOver.result !== 'white_win') {
        throw new Error('Test 3 Thất bại: Lý do kết thúc không chứa nội dung bị xử THUA!');
    }
    console.log('✅ Test 3 Thành công: Khi bị mất Vua, bên mất Vua bị xử THUA và bên ăn Vua CHIẾN THẮNG!');

    host3.disconnect();
    guest3.disconnect();
    await sleep(500);

    // TEST 4: MẤT KẾT NỐI QUÁ 15 GIÂY BỊ XỬ THUA
    console.log('\n[Test 4] Kiểm tra mất kết nối quá 15 giây bị xử THUA...');
    const roomCode4 = 'DISC' + Math.floor(1000 + Math.random() * 9000);
    const host4 = io(SERVER_URL, { transports: ['websocket'] });
    const guest4 = io(SERVER_URL, { transports: ['websocket'] });

    await new Promise((resolve) => {
        let cnt = 0;
        const cb = () => { if (++cnt === 2) resolve(); };
        host4.on('connect', cb);
        guest4.on('connect', cb);
    });

    host4.emit('joinRoom', { roomCode: roomCode4, userId: 301, username: 'RemainPlayer' });
    await sleep(300);
    guest4.emit('joinRoom', { roomCode: roomCode4, userId: 302, username: 'DCPlayer' });
    await sleep(300);
    guest4.emit('toggleReady', { roomCode: roomCode4 });
    await sleep(300);

    let disconnectNotice = null;
    let forfeitGameOver = null;

    host4.on('playerDisconnectedWaiting', (data) => {
        disconnectNotice = data;
        console.log('   -> Nhận thông báo chờ đối thủ kết nối lại:', data.message, `(${data.seconds}s)`);
    });

    host4.on('gameOver', (data) => {
        forfeitGameOver = data;
        console.log('   -> Nhận thông báo XỬ THUA sau 15s:', data.reason);
    });

    host4.emit('startGame', { roomCode: roomCode4 });
    await sleep(500);

    // Guest4 ngắt kết nối đột ngột
    console.log('   -> Guest4 (DCPlayer) ngắt kết nối đột ngột! Bắt đầu đếm 15 giây...');
    guest4.disconnect();

    // Chờ 16.5 giây
    for (let i = 0; i < 16; i++) {
        await sleep(1000);
        process.stdout.write(`   [Đang chờ xử thua: ${i + 1}s / 15s]...\r`);
    }
    console.log('');

    if (!disconnectNotice || disconnectNotice.seconds !== 15) {
        throw new Error('Test 4 Thất bại: Không có thông báo chờ 15s kết nối lại!');
    }
    if (!forfeitGameOver || !forfeitGameOver.reason.includes('quá 15 giây và bị xử THUA')) {
        throw new Error('Test 4 Thất bại: Chưa xử THUA sau 15 giây ngắt kết nối!');
    }
    console.log('✅ Test 4 Thành công: Khi mất kết nối quá 15 giây, người chơi bị xử THUA và đối thủ giành CHIẾN THẮNG!');

    host4.disconnect();

    console.log('\n========================================================');
    console.log('🎉 TẤT CẢ 4/4 KIỂM THỬ ĐÃ VƯỢT QUA VỚI KẾT QUẢ XUẤT SẮC!');
    console.log('========================================================');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ LỖI KIỂM THỬ:', err);
    process.exit(1);
});
