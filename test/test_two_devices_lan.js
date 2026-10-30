const io = require('../server/node_modules/socket.io-client');

const PC_URL = 'http://localhost:3000';
const LAN_DEVICE_URL = 'http://192.168.1.45:3000';

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function testTwoDevices() {
    console.log('=== KIỂM THỬ KẾT NỐI HAI THIẾT BỊ (DEVICE 1 & DEVICE 2 QUA LAN) ===');

    const roomCode = 'LAN' + Math.floor(1000 + Math.random() * 9000);
    const hostUser = { id: 8881, username: 'HostPlayer_PC' };
    const guestUser = { id: 8882, username: 'GuestPlayer_Phone' };

    // 1. Host kết nối phòng
    console.log(`[1] Thiết bị 1 (PC) kết nối phòng ${roomCode} tại ${PC_URL}...`);
    const sHost = io(PC_URL, { transports: ['websocket'] });

    let hostReadyPromise = new Promise((resolve) => {
        sHost.on('gameState', (data) => {
            console.log(`Host nhận gameState: isHost=${data.isHost}, isGameStarted=${data.isGameStarted}`);
            resolve(data);
        });
    });

    sHost.emit('joinRoom', { roomCode, userId: hostUser.id, username: hostUser.username });
    await hostReadyPromise;
    console.log('=> [PASSED] Thiết bị 1 vào phòng thành công!');

    // 2. Guest kết nối phòng qua LAN Wi-Fi
    console.log(`[2] Thiết bị 2 (Điện thoại) kết nối phòng ${roomCode} qua IP LAN ${LAN_DEVICE_URL}...`);
    const sGuest = io(LAN_DEVICE_URL, { transports: ['websocket'] });

    let guestJoinedPromise = new Promise((resolve) => {
        sGuest.on('gameState', (data) => {
            console.log(`Guest nhận gameState: role=${data.yourRole}, isHost=${data.isHost}`);
            resolve(data);
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
    console.log('=> [PASSED] Thiết bị 2 tham gia phòng qua IP LAN thành công!');

    // 3. Guest bấm Sẵn sàng
    console.log('[3] Thiết bị 2 bấm Sẵn sàng...');
    let readyPromise = new Promise((resolve) => {
        sHost.on('readyStatusChanged', (data) => {
            console.log(`Host nhận readyStatusChanged: opponentReady=${data.opponentReady}`);
            resolve(data);
        });
    });

    sGuest.emit('toggleReady', { roomCode });
    await readyPromise;
    console.log('=> [PASSED] Thiết bị 2 đã Sẵn sàng thành công!');

    // 4. Host bắt đầu trận đấu
    console.log('[4] Thiết bị 1 bấm Bắt đầu trận...');
    let hostStartPromise = new Promise((resolve) => {
        sHost.on('gameStarted', (data) => {
            console.log('Host nhận gameStarted:', data.message);
            resolve(data);
        });
    });
    let guestStartPromise = new Promise((resolve) => {
        sGuest.on('gameStarted', (data) => {
            console.log('Guest nhận gameStarted:', data.message);
            resolve(data);
        });
    });

    sHost.emit('startGame', { roomCode });
    await Promise.all([hostStartPromise, guestStartPromise]);
    console.log('=> [PASSED] Trận đấu đã bắt đầu trên cả 2 thiết bị!');

    // 5. Host đi nước cờ e2 -> e4
    console.log('[5] Thiết bị 1 đi nước cờ e2 -> e4...');
    let movePromise = new Promise((resolve) => {
        sGuest.on('move', (data) => {
            console.log(`Thiết bị 2 nhận nước đi từ Thiết bị 1: ${data.move.from}->${data.move.to} (${data.move.san})`);
            resolve(data);
        });
    });

    sHost.emit('move', { roomCode, move: { from: 'e2', to: 'e4', promotion: 'q' }, userId: hostUser.id });
    await movePromise;
    console.log('=> [PASSED] Nước đi được đồng bộ thời gian thực giữa 2 thiết bị thành công!');

    sHost.disconnect();
    sGuest.disconnect();

    console.log('\n=============================================');
    console.log('🎉 KIỂM THỬ 2 THIẾT BỊ QUA MẠNG LAN THÀNH CÔNG 100%! 🎉');
    console.log('=============================================');
}

testTwoDevices().catch(err => {
    console.error('❌ LỖI:', err.message);
    process.exit(1);
});
