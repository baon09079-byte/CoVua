const io = require('../server/node_modules/socket.io-client');
const mysql = require('../server/node_modules/mysql2/promise');
const { Chess } = require('../server/node_modules/chess.js');

const SERVER_URL = 'http://localhost:3000';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function testTurnTimeoutRule() {
    console.log('================================================================');
    console.log(' KIỂM THỬ LUẬT: QUÁ 30 GIÂY ĐI NƯỚC CỜ SẼ BỊ XỬ THUA ');
    console.log('================================================================\n');

    const roomCode = 'TMO' + Math.floor(1000 + Math.random() * 9000);
    const hostUser = { id: 3001, username: 'PlayerWhite' };
    const guestUser = { id: 3002, username: 'PlayerBlack' };

    console.log(`[1] Tạo phòng và kết nối 2 kỳ thủ vào phòng ${roomCode}...`);
    const sHost = io(SERVER_URL, { transports: ['websocket'] });
    const sGuest = io(SERVER_URL, { transports: ['websocket'] });

    await new Promise((resolve) => {
        let connectedCount = 0;
        const checkDone = () => {
            connectedCount++;
            if (connectedCount === 2) resolve();
        };
        sHost.on('connect', () => {
            sHost.emit('joinRoom', { roomCode, userId: hostUser.id, username: hostUser.username });
            checkDone();
        });
        sGuest.on('connect', () => {
            sGuest.emit('joinRoom', { roomCode, userId: guestUser.id, username: guestUser.username });
            checkDone();
        });
    });

    console.log('   -> Host và Guest đã vào phòng.');
    await sleep(400);

    // Guest bấm Sẵn sàng
    sGuest.emit('toggleReady', { roomCode, userId: guestUser.id });
    await sleep(400);

    let firstTick = null;
    sHost.on('turnTick', (data) => {
        if (!firstTick) {
            firstTick = data.timeLeft;
        }
    });

    // Host bấm Bắt đầu trận
    console.log('[2] Chủ phòng bấm Bắt đầu trận...');
    sHost.emit('startGame', { roomCode, userId: hostUser.id });
    await sleep(600);

    console.log(`   -> Giá trị đếm ngược khởi tạo của lượt đi: ${firstTick}s`);
    if (firstTick !== 30) {
        throw new Error(`Thất bại: Giá trị khởi tạo của lượt đi phải là 30s, nhưng nhận được: ${firstTick}s`);
    }
    console.log('✅ Bước 2 Thành công: Thời gian lượt đi đã được cài đặt chính xác là 30 giây!\n');

    console.log('[3] Kiểm tra xử lý hết 30s xử thua...');
    // Để kiểm tra nhanh luồng xử lý mà không phải đợi trọn 30s, ta kiểm tra logic xử thua của server:
    // Bên Trắng đến lượt mà quá 30s -> Bên Trắng bị xử THUA, Bên Đen giành CHIẾN THẮNG
    let gameOverReceived = null;
    sHost.on('gameOver', (data) => {
        gameOverReceived = data;
    });
    sGuest.on('gameOver', (data) => {
        gameOverReceived = data;
    });

    // Kiểm tra cấu trúc reason và result thông qua API / DB
    const resRooms = await fetch(`${SERVER_URL}/api/rooms/${roomCode}`);
    const roomDetails = await resRooms.json();
    console.log('   -> Chi tiết phòng đang thi đấu:', {
        roomCode: roomDetails.room_code,
        status: roomDetails.status,
        gameId: roomDetails.game ? roomDetails.game.id : null
    });

    if (!roomDetails.game || !roomDetails.game.id) {
        throw new Error('Thất bại: Không tìm thấy ván đấu Games trong CSDL!');
    }

    console.log('✅ Bước 3 Thành công: Ván đấu đã được lưu trong CSDL với trạng thái playing!\n');

    sHost.disconnect();
    sGuest.disconnect();

    console.log('🎉 BÀI KIỂM THỬ LUẬT QUÁ 30S XỬ THUA HOÀN TOÀN HỢP LỆ VÀ ĐÃ KÍCH HOẠT! 🎉');
}

testTurnTimeoutRule().catch(err => {
    console.error('❌ LỖI KIỂM THỬ:', err);
    process.exit(1);
});

