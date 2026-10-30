const io = require('../server/node_modules/socket.io-client');
const db = require('../server/database/db');

async function testDirectKingCapture() {
    console.log('--- TEST TRỰC TIẾP ĂN QUÂN VUA (DIRECT KING CAPTURE) ---');

    const socketUrl = 'http://localhost:3000';
    const roomCode = 'EATK' + Math.floor(1000 + Math.random() * 9000);

    const sHost = io(socketUrl, { transports: ['websocket'] });
    const sGuest = io(socketUrl, { transports: ['websocket'] });

    await new Promise(r => {
        sHost.once('gameState', r);
        sHost.emit('joinRoom', { roomCode, userId: 991, username: 'WhiteKingEater' });
    });

    await new Promise(r => {
        sGuest.once('gameState', r);
        sGuest.emit('joinRoom', { roomCode, userId: 992, username: 'BlackVictim' });
    });

    await new Promise(r => {
        sHost.once('readyStatusChanged', r);
        sGuest.emit('toggleReady', { roomCode });
    });

    await new Promise(r => {
        sHost.once('gameStarted', r);
        sHost.emit('startGame', { roomCode });
    });

    // Cập nhật thế cờ trong CSDL thành thế cờ chuẩn bị ăn vua:
    // Hậu Trắng ở e7, Vua Đen ở e8: '4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1'
    const setupFen = '4k3/4Q3/8/8/8/8/8/4K3 w - - 0 1';
    const [rooms] = await db.execute('SELECT id FROM Rooms WHERE room_code = ?', [roomCode]);
    await db.execute('UPDATE Games SET current_fen = ? WHERE room_id = ?', [setupFen, rooms[0].id]);

    console.log('✓ Đã thiết lập thế cờ: Hậu Trắng e7 chuẩn bị ăn Vua Đen e8');

    // Nước đi Hậu Trắng ăn Vua Đen (e7 -> e8)
    let moveReceived = false;
    let gameOverReceived = false;
    let gameOverData = null;

    sGuest.on('move', (data) => {
        console.log('✓ Guest nhận nước đi move:', data.move.san, 'isKingCaptured:', data.isKingCaptured);
        moveReceived = true;
    });

    sGuest.on('gameOver', (data) => {
        console.log('✓ Guest nhận thông báo gameOver:', data);
        gameOverReceived = true;
        gameOverData = data;
    });

    sHost.emit('move', {
        roomCode,
        move: { from: 'e7', to: 'e8', promotion: 'q' },
        userId: 991
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    sHost.disconnect();
    sGuest.disconnect();

    if (!moveReceived) throw new Error('Không nhận được sự kiện move khi ăn vua!');
    if (!gameOverReceived) throw new Error('Không nhận được sự kiện gameOver khi ăn vua!');
    if (gameOverData.result !== 'white_win') throw new Error(`Kỳ vọng white_win nhưng nhận được ${gameOverData.result}`);
    if (!gameOverData.reason.includes('ăn được vua')) throw new Error(`Lý do không chứa 'ăn được vua': ${gameOverData.reason}`);

    console.log('\n======================================================');
    console.log('XÁC NHẬN: NƯỚC ĂN VUA ĐƯỢC XỬ LÝ CHÍNH XÁC VÀ BÁO THẮNG!');
    console.log('======================================================');
    process.exit(0);
}

testDirectKingCapture().catch(e => {
    console.error('LỖI TEST TRỰC TIẾP ĂN VUA:', e);
    process.exit(1);
});
