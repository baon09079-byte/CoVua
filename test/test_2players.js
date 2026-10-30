const path = require('path');
const io = require(path.join(__dirname, '../server/node_modules/socket.io-client'));
const http = require('http');

async function run() {
    console.log('========================================================');
    console.log('KIỂM THỬ 2 NGƯỜI CHƠI THẬT ĐÁNH ONLINE VỚI NHAU');
    console.log('========================================================');

    const SERVER_URL = 'http://localhost:3000';
    const ROOM_CODE = 'TEST' + Math.floor(10 + Math.random() * 90);

    console.log(`\n1. Tạo 2 Socket giả lập 2 thiết bị người chơi thật:`);
    console.log(`- Người chơi 1: Hoàng Long (Host - Quân Trắng)`);
    console.log(`- Người chơi 2: Minh Trang (Bạn - Quân Đen)`);
    console.log(`- Mã phòng chia sẻ: ${ROOM_CODE}`);

    const socket1 = io(SERVER_URL, { transports: ['websocket'] });
    const socket2 = io(SERVER_URL, { transports: ['websocket'] });

    await new Promise((resolve, reject) => {
        let s1Connected = false;
        let s2Connected = false;

        socket1.on('connect', () => {
            s1Connected = true;
            console.log('   ✓ Người chơi 1 (Hoàng Long) đã kết nối socket.');
            if (s1Connected && s2Connected) resolve();
        });

        socket2.on('connect', () => {
            s2Connected = true;
            console.log('   ✓ Người chơi 2 (Minh Trang) đã kết nối socket.');
            if (s1Connected && s2Connected) resolve();
        });

        setTimeout(() => reject(new Error('Hết thời gian kết nối Socket.IO')), 5000);
    });

    console.log('\n2. Người chơi 1 (Host) vào phòng trước:');
    let p1Role = null;
    let p1GameState = null;

    await new Promise((resolve, reject) => {
        socket1.once('gameState', (data) => {
            p1Role = data.yourRole;
            p1GameState = data;
            console.log(`   ✓ Người chơi 1 nhận vai trò: ${p1Role}`);
            console.log(`   ✓ Trạng thái đối thủ: "${data.blackPlayerName}"`);
            if (p1Role !== 'white') {
                return reject(new Error(`Người chơi 1 phải là 'white', nhưng nhận được '${p1Role}'`));
            }
            resolve();
        });

        socket1.emit('joinRoom', {
            roomCode: ROOM_CODE,
            userId: 9001,
            username: 'Hoàng Long'
        });

        setTimeout(() => reject(new Error('Hết thời gian đợi gameState của Người chơi 1')), 5000);
    });

    console.log('\n3. Người chơi 2 (Bạn bè) tham gia phòng bằng mã / link:');
    let p2Role = null;
    let p1NotifiedOpponent = false;

    await new Promise((resolve, reject) => {
        socket1.once('opponentJoined', (data) => {
            p1NotifiedOpponent = true;
            console.log(`   ✓ Người chơi 1 nhận thông báo đối thủ vào: "${data.blackPlayerName}"`);
        });

        socket2.once('gameState', (data) => {
            p2Role = data.yourRole;
            console.log(`   ✓ Người chơi 2 nhận vai trò: ${p2Role}`);
            console.log(`   ✓ Tên bên Trắng: "${data.whitePlayerName}", Tên bên Đen: "${data.blackPlayerName}"`);
            if (p2Role !== 'black') {
                return reject(new Error(`Người chơi 2 phải là 'black', nhưng nhận được '${p2Role}'`));
            }
            resolve();
        });

        socket2.emit('joinRoom', {
            roomCode: ROOM_CODE,
            userId: 9002,
            username: 'Minh Trang'
        });

        setTimeout(() => reject(new Error('Hết thời gian đợi Người chơi 2 tham gia')), 5000);
    });

    console.log('\n4. Người chơi 1 (Quân Trắng) đi nước cờ đầu tiên: e2 -> e4');
    await new Promise((resolve, reject) => {
        let s1ReceivedMove = false;
        let s2ReceivedMove = false;

        socket1.once('move', (data) => {
            s1ReceivedMove = true;
            console.log(`   ✓ Người chơi 1 xác nhận nước đi: ${data.move.san}, Lượt tiếp theo: ${data.turn}`);
            if (s1ReceivedMove && s2ReceivedMove) resolve();
        });

        socket2.once('move', (data) => {
            s2ReceivedMove = true;
            console.log(`   ✓ Người chơi 2 nhìn thấy nước đi e4 của đối thủ theo thời gian thực!`);
            if (s1ReceivedMove && s2ReceivedMove) resolve();
        });

        socket1.emit('move', {
            roomCode: ROOM_CODE,
            move: { from: 'e2', to: 'e4', promotion: 'q' },
            userId: 9001
        });

        setTimeout(() => reject(new Error('Hết thời gian xử lý nước đi e4')), 5000);
    });

    console.log('\n5. Người chơi 2 (Quân Đen) đáp trả: e7 -> e5');
    await new Promise((resolve, reject) => {
        let s1ReceivedMove = false;
        let s2ReceivedMove = false;

        socket1.once('move', (data) => {
            s1ReceivedMove = true;
            console.log(`   ✓ Người chơi 1 thấy đối thủ đi: ${data.move.san}, Lượt tiếp theo: ${data.turn}`);
            if (s1ReceivedMove && s2ReceivedMove) resolve();
        });

        socket2.once('move', (data) => {
            s2ReceivedMove = true;
            console.log(`   ✓ Người chơi 2 xác nhận nước đi e5 thành công!`);
            if (s1ReceivedMove && s2ReceivedMove) resolve();
        });

        socket2.emit('move', {
            roomCode: ROOM_CODE,
            move: { from: 'e7', to: 'e5', promotion: 'q' },
            userId: 9002
        });

        setTimeout(() => reject(new Error('Hết thời gian xử lý nước đi e5')), 5000);
    });

    console.log('\n6. Người chơi 2 gửi tin nhắn trò chuyện cho Người chơi 1:');
    await new Promise((resolve, reject) => {
        socket1.once('chatMessage', (data) => {
            console.log(`   ✓ Người chơi 1 nhận được tin nhắn từ "${data.username}": "${data.message}"`);
            resolve();
        });

        socket2.emit('chatMessage', {
            roomCode: ROOM_CODE,
            userId: 9002,
            username: 'Minh Trang',
            message: 'Chào Long! Đánh ván này nhé! 🔥'
        });

        setTimeout(() => reject(new Error('Hết thời gian gửi nhận chat')), 5000);
    });

    console.log('\n========================================================');
    console.log(' KẾT QUẢ: TẤT CẢ TÍNH NĂNG ĐÁNH VỚI BẠN BÈ HOẠT ĐỘNG HOÀN HẢO 100%!');
    console.log(' - Tự động phân vai Trắng/Đen chuẩn xác');
    console.log(' - Đồng bộ nước đi 2 chiều tức thì');
    console.log(' - Trò chuyện thời gian thực mượt mà');
    console.log('========================================================');

    socket1.disconnect();
    socket2.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error('LỖI KIỂM THỬ:', err.message);
    process.exit(1);
});
