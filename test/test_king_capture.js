const io = require('../server/node_modules/socket.io-client');
const { Chess } = require('../server/node_modules/chess.js');

async function runKingCaptureTest() {
    console.log('--- BẮT ĐẦU KIỂM THỬ: ĂN ĐƯỢC VUA (KING CAPTURE) ---');

    const socketUrl = 'http://localhost:3000';
    const roomCode = 'KCAP' + Math.floor(1000 + Math.random() * 9000);

    const hostUser = { id: 7001, username: 'PlayerWhite' };
    const guestUser = { id: 7002, username: 'PlayerBlack' };

    // 1. Kết nối 2 sockets
    const sHost = io(socketUrl, { transports: ['websocket'] });
    const sGuest = io(socketUrl, { transports: ['websocket'] });

    await new Promise(r => {
        sHost.once('gameState', r);
        sHost.emit('joinRoom', { roomCode, userId: hostUser.id, username: hostUser.username });
    });

    await new Promise(r => {
        sGuest.once('gameState', r);
        sGuest.emit('joinRoom', { roomCode, userId: guestUser.id, username: guestUser.username });
    });

    // 2. Guest sẵn sàng & Host bắt đầu
    await new Promise(r => {
        sHost.once('readyStatusChanged', r);
        sGuest.emit('toggleReady', { roomCode });
    });

    await new Promise(r => {
        sHost.once('gameStarted', r);
        sHost.emit('startGame', { roomCode });
    });

    console.log('✓ Phòng chơi đã bắt đầu');

    // 3. Chơi Scholar's mate: 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
    // Sau nước Qxf7#, Hậu Trắng ở f7 đang chiếu vua Đen ở e8!
    const moves = [
        { from: 'e2', to: 'e4', user: hostUser.id, socket: sHost },
        { from: 'e7', to: 'e5', user: guestUser.id, socket: sGuest },
        { from: 'd1', to: 'h5', user: hostUser.id, socket: sHost },
        { from: 'b8', to: 'c6', user: guestUser.id, socket: sGuest },
        { from: 'f1', to: 'c4', user: hostUser.id, socket: sHost },
        { from: 'g8', to: 'f6', user: guestUser.id, socket: sGuest }
    ];

    for (const m of moves) {
        await new Promise(resolve => {
            const listener = () => {
                sHost.off('move', listener);
                sGuest.off('move', listener);
                resolve();
            };
            sHost.on('move', listener);
            m.socket.emit('move', { roomCode, move: { from: m.from, to: m.to, promotion: 'q' }, userId: m.user });
        });
    }
    console.log('✓ Đã đi 3 nước khai cuộc thành công');

    // 4. White đi Qxf7# chiếu hết
    let gameOverPromise = new Promise(resolve => {
        sHost.on('gameOver', (data) => {
            console.log('✓ Nhận thông báo gameOver từ server:', data);
            resolve(data);
        });
    });

    sHost.emit('move', { roomCode, move: { from: 'h5', to: 'f7', promotion: 'q' }, userId: hostUser.id });
    const gameOverData = await gameOverPromise;

    console.log(`✓ Kết quả trận đấu: ${gameOverData.result} - Lý do: ${gameOverData.reason}`);
    if (gameOverData.result !== 'white_win') {
        throw new Error(`Kỳ vọng white_win nhưng nhận được ${gameOverData.result}`);
    }

    sHost.disconnect();
    sGuest.disconnect();

    console.log('\n======================================================');
    console.log('TEST ĂN VUA / CHIẾU HẾT HOÀN TOÀN THÀNH CÔNG VÀ ỔN ĐỊNH!');
    console.log('======================================================');
    process.exit(0);
}

runKingCaptureTest().catch(err => {
    console.error('LỖI TEST:', err);
    process.exit(1);
});
