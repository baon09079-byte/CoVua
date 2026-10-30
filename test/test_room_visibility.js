const path = require('path');
const io = require(path.join(__dirname, '../server/node_modules/socket.io-client'));

async function testRoomVisibility() {
    console.log('========================================================');
    console.log('KIỂM THỬ: PHÒNG CÓ NGƯỜI THÌ HIỆN, CẢ 2 THOÁT THÌ BIẾN MẤT');
    console.log('========================================================');

    const BASE_URL = 'http://localhost:3000';
    const ROOM_CODE = 'LIVE' + Math.floor(100 + Math.random() * 900);

    // 1. Kiểm tra ban đầu khi chưa có ai vào phòng
    console.log(`1. Tạo phòng ${ROOM_CODE} qua API create:`);
    const createRes = await fetch(`${BASE_URL}/api/rooms/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 1 })
    });
    const createData = await createRes.json();
    const createdCode = createData.roomCode;
    console.log(`   ✓ Đã tạo phòng mới: ${createdCode}`);

    // 2. Người chơi vào phòng cờ (1 người đang chờ)
    console.log(`2. Người chơi kết nối vào phòng ${createdCode}:`);
    const socket1 = io(BASE_URL, { transports: ['websocket'] });
    await new Promise((resolve) => {
        socket1.on('connect', () => {
            socket1.emit('joinRoom', { roomCode: createdCode, userId: 1, username: 'NgườiChờ' });
            socket1.once('gameState', () => resolve());
        });
    });
    console.log(`   ✓ Người chơi đã ở trong phòng cờ.`);

    // 3. Kiểm tra danh sách phòng chờ
    const listRes1 = await fetch(`${BASE_URL}/api/rooms/list`);
    const listData1 = await listRes1.json();
    const found1 = listData1.some(r => r.room_code === createdCode);
    console.log(`3. Kiểm tra danh sách phòng khi có người đang chờ:`);
    console.log(`   - Phòng ${createdCode} có xuất hiện trong danh sách không? -> ${found1 ? 'CÓ (ĐÚNG)' : 'KHÔNG'}`);
    if (!found1) throw new Error('Phòng đang có người chờ nhưng không hiển thị trong danh sách!');

    // 4. Người chơi thoát phòng (cả 2 đều không còn trong phòng)
    console.log(`4. Người chơi thoát phòng cờ (bấm Rời phòng):`);
    socket1.emit('leaveRoom');
    socket1.disconnect();

    // Chờ 1 giây để server cập nhật trạng thái
    await new Promise(r => setTimeout(r, 1000));

    // 5. Kiểm tra lại danh sách phòng
    const listRes2 = await fetch(`${BASE_URL}/api/rooms/list`);
    const listData2 = await listRes2.json();
    const found2 = listData2.some(r => r.room_code === createdCode);
    console.log(`5. Kiểm tra danh sách phòng sau khi người chơi đã thoát:`);
    console.log(`   - Phòng ${createdCode} có biến mất khỏi danh sách không? -> ${!found2 ? 'ĐÃ BIẾN MẤT (ĐÚNG)' : 'VẪN CÒN (SAI)'}`);
    if (found2) throw new Error('Cả 2 đã thoát nhưng phòng vẫn còn hiển thị!');

    console.log('\n========================================================');
    console.log(' KẾT QUẢ: PHÒNG CÓ NGƯỜI THÌ HIỆN, THOÁT HẾT THÌ MẤT -> 100% HOÀN HẢO!');
    console.log('========================================================');
    process.exit(0);
}

testRoomVisibility().catch(err => {
    console.error('LỖI:', err.message);
    process.exit(1);
});

