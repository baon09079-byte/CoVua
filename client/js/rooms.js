// ============================================================
// Quản lý phòng chơi (Rooms logic)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Kiểm tra đăng nhập
    if (!Auth.isLoggedIn()) {
        showToast('Vui lòng đăng nhập để vào phòng chơi', 'error');
        setTimeout(() => {
            window.location.href = '/pages/login.html';
        }, 1200);
        return;
    }

    const user = Auth.getUser();
    const userGreeting = document.getElementById('user-greeting');
    if (userGreeting && user) {
        userGreeting.textContent = user.username;
    }

    // Nạp danh sách phòng
    loadRooms();

    // Sự kiện Tạo phòng
    const createRoomBtn = document.getElementById('create-room-btn');
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', handleCreateRoom);
    }

    // Sự kiện Tham gia bằng mã
    const joinCodeForm = document.getElementById('join-code-form');
    if (joinCodeForm) {
        joinCodeForm.addEventListener('submit', handleJoinByCode);
    }

    // Sự kiện Làm mới danh sách
    const refreshBtn = document.getElementById('refresh-rooms-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadRooms();
            showToast('Đã làm mới danh sách phòng', 'info');
        });
    }

    // Đóng Modal
    const modalClose = document.getElementById('modal-close-btn');
    const modalOverlay = document.getElementById('room-created-modal');
    if (modalClose && modalOverlay) {
        modalClose.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
        });
    }
});

// Tải danh sách phòng từ server
async function loadRooms() {
    const listContainer = document.getElementById('rooms-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;"><i class="fas fa-spinner fa-spin fa-2x"></i><p style="margin-top: 10px;">Đang tải danh sách phòng...</p></div>';

    try {
        const res = await fetch('/api/rooms/list');
        const rooms = await res.json();

        if (!rooms || rooms.length === 0) {
            listContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md); padding: 50px 20px;">
                    <i class="fas fa-chess-board fa-3x" style="color: var(--text-muted); margin-bottom: 15px;"></i>
                    <h3 style="color: #fff; margin-bottom: 8px;">Hiện chưa có phòng nào đang chờ</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">Hãy tạo một phòng mới và chia sẻ mã cho bạn bè để cùng chơi!</p>
                    <button class="btn btn-primary" onclick="document.getElementById('create-room-btn').click()">
                        <i class="fas fa-plus-circle"></i> Tạo phòng ngay
                    </button>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        rooms.forEach(r => {
            const timeAgo = formatTimeAgo(new Date(r.created_at));
            const card = document.createElement('div');
            card.className = 'room-card';
            card.innerHTML = `
                <div class="room-card-header">
                    <span class="room-code-badge">${r.room_code}</span>
                    <span class="room-status waiting"><i class="fas fa-clock"></i> Đang chờ</span>
                </div>
                <div class="room-host-info">
                    <p><i class="fas fa-user-crown"></i> Chủ phòng: <strong style="color: #fff;">${r.host_name || 'Người chơi'}</strong></p>
                    <p style="font-size: 0.8rem; margin-top: 4px;"><i class="far fa-clock"></i> Tạo lúc: ${timeAgo}</p>
                </div>
                <button class="btn btn-primary btn-block" onclick="joinRoomDirect('${r.room_code}')">
                    <i class="fas fa-sign-in-alt"></i> Tham gia trận đấu
                </button>
            `;
            listContainer.appendChild(card);
        });
    } catch (err) {
        listContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 40px;"><i class="fas fa-exclamation-triangle fa-2x"></i><p>Không thể kết nối danh sách phòng</p></div>';
    }
}

// Xử lý tạo phòng
async function handleCreateRoom() {
    const user = Auth.getUser();
    if (!user) return;

    const btn = document.getElementById('create-room-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';

    try {
        const res = await Auth.fetchWithAuth('/api/rooms/create', {
            method: 'POST',
            body: JSON.stringify({ userId: user.id })
        });
        const data = await res.json();

        if (res.ok) {
            const modal = document.getElementById('room-created-modal');
            const roomCodeDisplay = document.getElementById('created-room-code');
            const shareLinkInput = document.getElementById('share-link-input');
            const enterRoomBtn = document.getElementById('enter-room-btn');

            let fullUrl = `${window.location.origin}/pages/game.html?room=${data.roomCode}&join=1`;

            try {
                const sInfo = await fetch('/api/server-info');
                if (sInfo.ok) {
                    const info = await sInfo.json();
                    if (info.ip && info.ip !== '127.0.0.1') {
                        // Ưu tiên đường dẫn qua IP mạng LAN (cổng 3000) để thiết bị thứ hai (điện thoại/máy khác cùng Wi-Fi) truy cập trực tiếp
                        fullUrl = `http://${info.ip}:3000/pages/game.html?room=${data.roomCode}&join=1`;
                    }
                }
            } catch (e) {}

            if (roomCodeDisplay) roomCodeDisplay.textContent = data.roomCode;
            if (shareLinkInput) shareLinkInput.value = fullUrl;
            if (enterRoomBtn) {
                enterRoomBtn.onclick = () => {
                    window.location.href = `/pages/game.html?room=${data.roomCode}`;
                };
            }

            modal.classList.add('active');
            loadRooms(); // cập nhật danh sách
        } else {
            showToast(data.message || 'Không thể tạo phòng', 'error');
        }
    } catch (err) {
        showToast('Lỗi máy chủ khi tạo phòng', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plus-circle"></i> Tạo phòng mới';
    }
}

// Xử lý tham gia bằng mã phòng từ form input
async function handleJoinByCode(e) {
    e.preventDefault();
    const input = document.getElementById('room-code-input');
    const code = input.value.trim().toUpperCase();
    if (!code) {
        showToast('Vui lòng nhập mã phòng', 'error');
        return;
    }
    await joinRoomDirect(code);
}

// Hàm tham gia phòng
async function joinRoomDirect(roomCode) {
    const user = Auth.getUser();
    if (!user) return;

    const cleanCode = (roomCode || '').trim().toUpperCase();
    if (!cleanCode) {
        showToast('Vui lòng nhập mã phòng hợp lệ', 'error');
        return;
    }

    showToast('Đang kết nối vào phòng thời gian thực...', 'info');

    // Đồng thời gọi API chuẩn bị ván đấu trong CSDL
    try {
        await Auth.fetchWithAuth('/api/rooms/join', {
            method: 'POST',
            body: JSON.stringify({ roomCode: cleanCode, userId: user.id })
        });
    } catch (err) {
        console.warn('API join notice:', err);
    }

    // Luôn chuyển hướng ngay lập tức sang trang game để Socket.IO kết nối thời gian thực (Real-time)
    setTimeout(() => {
        window.location.href = `/pages/game.html?room=${cleanCode}&join=1`;
    }, 200);
}

// Sao chép mã phòng vào clipboard
function copyRoomCode() {
    const code = document.getElementById('created-room-code').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast('Đã sao chép mã phòng!', 'success');
    });
}

// Sao chép link mời vào clipboard
function copyShareLink() {
    const link = document.getElementById('share-link-input').value;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Đã sao chép đường dẫn mời bạn bè!', 'success');
    });
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Vừa xong';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} phút trước`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ trước`;
    return `${Math.floor(hours / 24)} ngày trước`;
}

