const path = require('path');
const io = require(path.join(__dirname, '../server/node_modules/socket.io-client'));

async function testForfeit() {
    console.log('========================================================');
    console.log('KIỂM THỬ TÍNH NĂNG: THOÁT PHÒNG KHI CHƯA XONG -> ĐỐI THỦ THẮNG');
    console.log('========================================================');

    const SERVER_URL = 'http://localhost:3000';
    const ROOM_CODE = 'FF' + Math.floor(1000 + Math.random() * 9000);

    const socket1 = io(SERVER_URL, { transports: ['websocket'] });
    const socket2 = io(SERVER_URL, { transports: ['websocket'] });

    await new Promise((resolve) => {
        let c1 = false, c2 = false;
        socket1.on('connect', () => { c1 = true; if (c1 && c2) resolve(); });
        socket2.on('connect', () => { c2 = true; if (c1 && c2) resolve(); });
    });

    console.log(`1. Người 1 (Bên Trắng) vào phòng ${ROOM_CODE}`);
    await new Promise((resolve) => {
        socket1.once('gameState', () => resolve());
        socket1.emit('joinRoom', { roomCode: ROOM_CODE, userId: 101, username: 'Người 1' });
    });

    console.log(`2. Người 2 (Bên Đen) vào phòng`);
    await new Promise((resolve) => {
        socket2.once('gameState', () => resolve());
        socket2.emit('joinRoom', { roomCode: ROOM_CODE, userId: 102, username: 'Người 2' });
    });

    console.log(`3. Ván đấu đang diễn ra. Người 2 (Bên Đen) bấm THOÁT PHÒNG:`);
    const gameOverPromise = new Promise((resolve, reject) => {
        socket1.once('gameOver', (data) => {
            console.log(`   ✓ Người 1 nhận thông báo kết thúc ván cờ:`);
            console.log(`   - Kết quả: ${data.result}`);
            console.log(`   - Lý do: "${data.reason}"`);

            if (data.result === 'white_win') {
                console.log(`   ✓ CHÍNH XÁC: Người 2 thoát phòng -> Người 1 (Bên Trắng) ĐƯỢC XỬ THẮNG!`);
                resolve();
            } else {
                reject(new Error(`Kết quả mong đợi 'white_win', nhưng nhận được '${data.result}'`));
            }
        });

        setTimeout(() => reject(new Error('Hết thời gian chờ sự kiện gameOver khi đối thủ thoát')), 5000);
    });

    // Người 2 rời phòng
    socket2.emit('leaveRoom');

    await gameOverPromise;

    console.log('\n========================================================');
    console.log(' KẾT QUẢ: TÍNH NĂNG XỬ THẮNG KHI ĐỐI THỦ THOÁT HOẠT ĐỘNG 100%!');
    console.log('========================================================');

    socket1.disconnect();
    socket2.disconnect();
    process.exit(0);
}

testForfeit().catch(err => {
    console.error('LỖI KIỂM THỬ:', err.message);
    process.exit(1);
});

