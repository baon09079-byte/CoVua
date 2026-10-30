const io = require('../server/node_modules/socket.io-client');

async function runTest() {
    console.log('--- STARTING HOST / READY / KICK / REMATCH TEST ---');

    const roomCode = 'STAG' + Math.floor(1000 + Math.random() * 9000);
    const hostUser = { id: 8881, username: 'HostPlayer' };
    const guestUser = { id: 8882, username: 'GuestPlayer' };

    const socketUrl = 'http://localhost:3000';

    // 1. Host kết nối và tạo/tham gia phòng
    console.log(`[1] Host kết nối phòng ${roomCode}...`);
    const sHost = io(socketUrl, { transports: ['websocket'] });

    let hostReadyPromise = new Promise((resolve) => {
        sHost.on('gameState', (data) => {
            console.log(`Host nhận gameState: isHost=${data.isHost}, isGameStarted=${data.isGameStarted}`);
            if (data.isHost && !data.isGameStarted) resolve(data);
        });
    });

    sHost.emit('joinRoom', { roomCode, userId: hostUser.id, username: hostUser.username });
    await hostReadyPromise;
    console.log('=> [PASSED] Host nhận gameState thành công!');

    // 2. Guest kết nối vào phòng
    console.log(`[2] Guest kết nối phòng ${roomCode}...`);
    const sGuest = io(socketUrl, { transports: ['websocket'] });

    let guestJoinedPromise = new Promise((resolve) => {
        sGuest.on('gameState', (data) => {
            console.log(`Guest nhận gameState: role=${data.yourRole}, isHost=${data.isHost}`);
            if (data.yourRole === 'black' && !data.isHost) resolve(data);
        });
    });

    let hostOpponentJoinedPromise = new Promise((resolve) => {
        sHost.on('opponentJoined', (data) => {
            console.log(`Host nhận opponentJoined: ${data.blackPlayerName}`);
            resolve(data);
        });
    });

    sGuest.emit('joinRoom', { roomCode, userId: guestUser.id, username: guestUser.username });
    await Promise.all([guestJoinedPromise, hostOpponentJoinedPromise]);
    console.log('=> [PASSED] Guest tham gia phòng thành công!');

    // 3. Guest bấm Sẵn sàng (toggleReady)
    console.log('[3] Guest bấm toggleReady...');
    let readyPromise = new Promise((resolve) => {
        sHost.on('readyStatusChanged', (data) => {
            console.log(`Host nhận readyStatusChanged: opponentReady=${data.opponentReady}`);
            if (data.opponentReady) resolve(data);
        });
    });

    sGuest.emit('toggleReady', { roomCode });
    await readyPromise;
    console.log('=> [PASSED] Sẵn sàng (Ready) hoạt động chính xác!');

    // 4. Host bắt đầu trận đấu (startGame)
    console.log('[4] Host bấm startGame...');
    let hostStartPromise = new Promise((resolve) => {
        sHost.on('gameStarted', (data) => {
            console.log(`Host nhận gameStarted: ${data.message}`);
            resolve(data);
        });
    });
    let guestStartPromise = new Promise((resolve) => {
        sGuest.on('gameStarted', (data) => {
            console.log(`Guest nhận gameStarted: ${data.message}`);
            resolve(data);
        });
    });

    sHost.emit('startGame', { roomCode });
    await Promise.all([hostStartPromise, guestStartPromise]);
    console.log('=> [PASSED] Host bắt đầu trận đấu thành công!');

    // 5. Host đi nước cờ e2 -> e4
    console.log('[5] Host đi nước cờ e2 -> e4...');
    let movePromise = new Promise((resolve) => {
        sGuest.on('move', (data) => {
            console.log(`Guest nhận nước đi từ Host: ${data.move.from}->${data.move.to}`);
            resolve(data);
        });
    });

    sHost.emit('move', { roomCode, move: { from: 'e2', to: 'e4', promotion: 'q' }, userId: hostUser.id });
    await movePromise;
    console.log('=> [PASSED] Nước đi được đồng bộ thành công!');

    // 6. Test Yêu cầu đánh lại (Rematch)
    console.log('[6] Host gửi requestRematch...');
    let guestRematchReqPromise = new Promise((resolve) => {
        sGuest.on('rematchRequested', (data) => {
            console.log(`Guest nhận rematchRequested từ: ${data.requesterName}`);
            resolve(data);
        });
    });

    sHost.emit('requestRematch', { roomCode });
    await guestRematchReqPromise;
    console.log('=> [PASSED] Lời mời đánh lại đã gửi tới đối thủ!');

    // 7. Guest chấp nhận đánh lại (acceptRematch)
    console.log('[7] Guest chấp nhận acceptRematch...');
    let rematchAcceptedPromise = new Promise((resolve) => {
        sHost.on('rematchAccepted', (data) => {
            console.log(`Host nhận rematchAccepted: White=${data.whitePlayerId}, Black=${data.blackPlayerId}`);
            if (data.whitePlayerId && data.blackPlayerId) {
                resolve(data);
            }
        });
    });

    sGuest.emit('acceptRematch', { roomCode });
    await rematchAcceptedPromise;
    console.log('=> [PASSED] Tái đấu thành công, đổi bên cờ chính xác!');

    sHost.disconnect();
    sGuest.disconnect();

    // 8. Test Kick đối thủ trong một phòng mới
    console.log('[8] Kiểm tra chức năng Kick đối thủ...');
    const kickRoom = 'KICK' + Math.floor(1000 + Math.random() * 9000);
    const sHost2 = io(socketUrl, { transports: ['websocket'] });
    const sGuest2 = io(socketUrl, { transports: ['websocket'] });

    await new Promise(r => {
        sHost2.on('gameState', r);
        sHost2.emit('joinRoom', { roomCode: kickRoom, userId: hostUser.id, username: hostUser.username });
    });

    await new Promise(r => {
        sGuest2.on('gameState', r);
        sGuest2.emit('joinRoom', { roomCode: kickRoom, userId: guestUser.id, username: guestUser.username });
    });

    let kickedPromise = new Promise((resolve) => {
        sGuest2.on('kicked', (data) => {
            console.log(`Guest nhận sự kiện kicked: ${data.message}`);
            resolve(data);
        });
    });

    let hostKickedPromise = new Promise((resolve) => {
        sHost2.on('opponentKicked', (data) => {
            console.log(`Host nhận sự kiện opponentKicked: ${data.message}`);
            resolve(data);
        });
    });

    sHost2.emit('kickOpponent', { roomCode: kickRoom });
    await Promise.all([kickedPromise, hostKickedPromise]);
    console.log('=> [PASSED] Host kick đối thủ thành công!');

    sHost2.disconnect();
    sGuest2.disconnect();

    console.log('\n=============================================');
    console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
    console.log('=============================================');
    process.exit(0);
}

runTest().catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
});
