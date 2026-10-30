const io = require('../server/node_modules/socket.io-client');
const http = require('http');

async function postJson(url, data) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const postData = JSON.stringify(data);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch(e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function runTest() {
    console.log('=== KIỂM THỬ TOÀN DIỆN VÀO PHÒNG BẰNG MÃ & VIDEO CALL THỜI GIAN THỰC ===\n');

    // 1. Tạo phòng mới
    console.log('1. Chủ phòng (User 1) tạo phòng mới...');
    const createRes = await postJson('http://localhost:3000/api/rooms/create', { userId: 1 });
    const roomCode = createRes.data.roomCode;
    console.log(`- Đã tạo phòng thành công: Mã phòng = "${roomCode}"`);

    // 2. Chủ phòng vào phòng qua Socket.IO (như khi đang ở trang game.html)
    console.log('2. Chủ phòng kết nối vào phòng qua Socket.IO...');
    const hostSocket = io('http://localhost:3000');
    await new Promise((resolve) => {
        hostSocket.on('connect', () => {
            console.log('- Chủ phòng đã kết nối Socket và gửi joinRoom');
            hostSocket.emit('joinRoom', { roomCode, userId: 1, username: 'Gbao123' });
            resolve();
        });
    });

    await new Promise(r => setTimeout(r, 500));

    // 3. Giả lập đối thủ nhập mã phòng (kể cả có dấu cách thừa hoặc chữ thường)
    console.log(`3. Đối thủ nhập mã phòng "${roomCode.toLowerCase()}" để tham gia...`);
    const joinRes = await postJson('http://localhost:3000/api/rooms/join', {
        roomCode: `  ${roomCode.toLowerCase()}  `,
        userId: 2
    });
    console.log(`- Kết quả gọi API vào phòng: HTTP ${joinRes.status}:`, joinRes.data.message);
    if (joinRes.status !== 200) {
        throw new Error(`Thất bại khi vào phòng bằng mã! Status: ${joinRes.status}`);
    }

    // 4. Đối thủ kết nối vào trang game qua Socket.IO
    console.log('4. Đối thủ kết nối vào bàn cờ thời gian thực...');
    const guestSocket = io('http://localhost:3000');
    
    // Chủ phòng lắng nghe sự kiện đối thủ tham gia trong thời gian thực
    const hostSawGuestJoin = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chủ phòng không nhận được thông báo đối thủ vào phòng')), 6000);
        hostSocket.on('playerJoined', (data) => {
            clearTimeout(timer);
            console.log(`✓ Chủ phòng nhận thông báo thời gian thực: ${data.username} (${data.role}) đã vào phòng!`);
            resolve();
        });
    });

    guestSocket.on('connect', () => {
        console.log('- Đối thủ đã kết nối Socket và gửi joinRoom');
        guestSocket.emit('joinRoom', { roomCode, userId: 2, username: 'PlayerTwo' });
    });

    await hostSawGuestJoin;

    // 5. Test Đối thủ gọi video cho Chủ phòng (Real-time Video Call)
    console.log('\n5. Kiểm thử Video Call thời gian thực: Đối thủ gọi cho Chủ phòng...');
    const callAnsweredPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout cuộc gọi video từ đối thủ')), 6000);
        
        // Chủ phòng nhận offer từ đối thủ và tự động trả lời Answer
        hostSocket.on('videoSignal', (sig) => {
            if (sig.type === 'offer') {
                console.log('✓ Chủ phòng NHẬN ĐƯỢC tín hiệu gọi video (Offer) từ Đối thủ!');
                hostSocket.emit('videoSignal', {
                    roomCode,
                    signal: { type: 'answer', sdp: { type: 'answer', sdp: 'fake-sdp-answer-from-host' } }
                });
            }
        });

        // Đối thủ nhận answer từ chủ phòng
        guestSocket.on('videoSignal', (sig) => {
            if (sig.type === 'answer') {
                clearTimeout(timer);
                console.log('✓ Đối thủ NHẬN ĐƯỢC tín hiệu trả lời (Answer) từ Chủ phòng! Cuộc gọi kết nối!');
                resolve();
            }
        });
    });

    guestSocket.emit('videoSignal', {
        roomCode,
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'fake-sdp-offer-from-guest' } }
    });

    await callAnsweredPromise;

    // 6. Test Chủ phòng gọi video cho Đối thủ
    console.log('\n6. Kiểm thử Video Call thời gian thực: Chủ phòng gọi cho Đối thủ...');
    const hostCallAnsweredPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout cuộc gọi video từ chủ phòng')), 6000);
        
        guestSocket.on('videoSignal', (sig) => {
            if (sig.type === 'offer') {
                console.log('✓ Đối thủ NHẬN ĐƯỢC tín hiệu gọi video (Offer) từ Chủ phòng!');
                guestSocket.emit('videoSignal', {
                    roomCode,
                    signal: { type: 'answer', sdp: { type: 'answer', sdp: 'fake-sdp-answer-from-guest' } }
                });
            }
        });

        hostSocket.on('videoSignal', (sig) => {
            if (sig.type === 'answer') {
                clearTimeout(timer);
                console.log('✓ Chủ phòng NHẬN ĐƯỢC tín hiệu trả lời (Answer) từ Đối thủ! Cuộc gọi kết nối!');
                resolve();
            }
        });
    });

    hostSocket.emit('videoSignal', {
        roomCode,
        signal: { type: 'offer', sdp: { type: 'offer', sdp: 'fake-sdp-offer-from-host' } }
    });

    await hostCallAnsweredPromise;

    // 7. Test dọn dẹp và đóng socket an toàn
    hostSocket.disconnect();
    guestSocket.disconnect();

    console.log('\n================================================================');
    console.log('🎉 TẤT CẢ TÍNH NĂNG ĐÃ HOẠT ĐỘNG HOÀN TOÀN CHÍNH XÁC VÀ REAL-TIME!');
    console.log('================================================================');
    process.exit(0);
}

runTest().catch(err => {
    console.error('\n❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ:', err);
    process.exit(1);
});
