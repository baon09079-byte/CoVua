// ============================================================
// Logic Trang Chơi Cờ Vua Trực Tuyến (Game Page)
// ============================================================

let socket = null;
let chess = null;
let board = null;
let roomCode = null;
let roomId = null;
let currentUser = null;
let playerRole = 'spectator'; // 'white', 'black', 'spectator'
let whitePlayerInfo = null;
let blackPlayerInfo = null;
let isGameOver = false;

// Trạng thái chuẩn bị phòng (Staging State)
let isHost = false;
let isGameStarted = false;
let opponentReady = false;
let myReadyState = false;

// Đếm ngược 30 giây mỗi lượt đánh (quá 30s xử thua)
let turnTimeLeft = 30;

// Lịch sử nước đi đầy đủ của ván cờ hiện tại (dùng cho Replay & Xem lại)
let currentMatchMoveHistory = [];

// Đồng hồ (10 phút mỗi bên)
let whiteTime = 600;
let blackTime = 600;
let clockInterval = null;

// WebRTC State
let peerConnection = null;
let localStream = null;
let isMicMuted = false;
let isCamOff = false;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

function bootGame() {
    console.log('[Game] Khởi tạo bàn cờ & giao diện phòng chơi...');
    try {
        // 1. Kiểm tra đăng nhập (ưu tiên tài khoản thật, nếu là link mời join=1 trên cùng trình duyệt thì tạo khách riêng)
        const urlParams = new URLSearchParams(window.location.search);
        const isInvitedJoin = urlParams.get('join') === '1' || urlParams.get('as') === 'black' || urlParams.get('player') === '2';

        if (typeof Auth !== 'undefined' && Auth.isLoggedIn && Auth.isLoggedIn() && Auth.getUser() && !isInvitedJoin) {
            currentUser = Auth.getUser();
        } else {
            let tabUser = null;
            try {
                const raw = sessionStorage.getItem('chess_tab_guest');
                if (raw) tabUser = JSON.parse(raw);
            } catch (e) {}

            if (!tabUser || isInvitedJoin) {
                const guestId = Math.floor(10000 + Math.random() * 90000);
                tabUser = { id: guestId, username: `Khách_${guestId}` };
                sessionStorage.setItem('chess_tab_guest', JSON.stringify(tabUser));
            }
            currentUser = tabUser;
        }

        // Cập nhật tên người dùng ở navbar
        const currentNameEl = document.getElementById('current-user-name');
        if (currentNameEl && currentUser) {
            currentNameEl.textContent = currentUser.username;
        }

        // 2. Kiểm tra nếu là liên kết xem lại trực tiếp ván cờ (?replay=123 hoặc ?gameId=123)
        const directReplayId = urlParams.get('replay') || urlParams.get('gameId');
        if (directReplayId) {
            initDirectReplayView(directReplayId);
            return;
        }

        // Lấy mã phòng từ URL (loại bỏ mọi khoảng trắng và ký tự thừa)
        let rawCode = urlParams.get('room');
        if (!rawCode) {
            showToast('Không tìm thấy mã phòng!', 'error');
            setTimeout(() => window.location.href = '/pages/rooms.html', 1500);
            return;
        }
        roomCode = rawCode.replace(/\s+/g, '').toUpperCase();
        const codeDisplay = document.getElementById('display-room-code');
        if (codeDisplay) codeDisplay.textContent = roomCode;

        // 3. Khởi tạo chess.js
        if (typeof Chess === 'undefined') {
            console.error('[Game Error] Thư viện Chess chưa được tải!');
            showToast('Đang tải lại thư viện cờ vua...', 'warning');
            return;
        }
        chess = new Chess();

        // 4. Khởi tạo Bàn cờ UI
        if (typeof ChessboardUI === 'undefined') {
            console.error('[Game Error] Thư viện ChessboardUI chưa được tải!');
            return;
        }

        const mount = document.getElementById('chessboard-mount');
        if (mount) {
            board = new ChessboardUI('#chessboard-mount', {
                orientation: 'white',
                draggable: true,
                clickable: true,
                showEvalBar: true,
                onSelect: handleSquareSelect,
                onMove: handlePlayerMove
            });
        }

        // 5. Kết nối Socket.IO
        initSocket();

        // 6. Gắn các sự kiện UI
        attachUIEvents();
    } catch (err) {
        console.error('[Game Boot Error]:', err);
        showToast('Lỗi khởi tạo bàn cờ: ' + err.message, 'error');
    }
}

// Đảm bảo chạy dù DOMContentLoaded đã kích hoạt hay chưa
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootGame);
} else {
    bootGame();
}

// ================= SOCKET.IO & GAME STATE =================
function initSocket() {
    let socketUrl = undefined;
    // Nếu chạy qua HTTPS (như https://localhost:7015), dùng same-origin để ASP.NET Core proxy /socket.io về Node.js (tránh Mixed Content)
    // Nếu chạy qua HTTP, kết nối trực tiếp đến Node.js cổng 3000
    if (window.location.protocol === 'http:' && window.location.port !== '3000') {
        socketUrl = `http://${window.location.hostname || 'localhost'}:3000`;
    }
    try {
        socket = typeof io !== 'undefined' ? io(socketUrl, {
            transports: ['websocket', 'polling'],
            timeout: 10000,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000
        }) : null;
    } catch (e) {
        socket = null;
    }

    if (!socket) {
        showToast('Không thể kết nối máy chủ thời gian thực Socket.IO', 'error');
        return;
    }

    socket.on('connect_error', (err) => {
        console.warn('[Socket connect_error]:', err);
        const badge = document.getElementById('turn-status-badge');
        if (badge) {
            badge.textContent = 'Mất kết nối máy chủ';
            badge.className = 'badge badge-loss';
        }
    });

    socket.on('disconnect', (reason) => {
        console.warn('[Socket disconnect]:', reason);
        const badge = document.getElementById('turn-status-badge');
        if (badge) {
            badge.textContent = 'Mất kết nối máy chủ';
            badge.className = 'badge badge-loss';
        }
    });

    socket.on('connect', () => {
        console.log('[Socket] Đã kết nối với máy chủ!');
        const badge = document.getElementById('turn-status-badge');
        if (badge && badge.textContent === 'Mất kết nối máy chủ') {
            badge.textContent = 'Đã kết nối lại';
            badge.className = 'badge badge-win';
        }
        // Gửi yêu cầu tham gia phòng
        socket.emit('joinRoom', {
            roomCode,
            userId: currentUser.id,
            username: currentUser.username
        });
    });

    // Nhận trạng thái ván cờ từ server
    socket.on('gameState', (data) => {
        console.log('[Socket] Nhận gameState:', data);
        roomId = data.roomId;
        isGameOver = (data.status === 'finished');
        isHost = Boolean(data.isHost);
        isGameStarted = Boolean(data.isGameStarted);
        opponentReady = Boolean(data.opponentReady);

        // Xác định vai trò của người chơi (ưu tiên do Server gán trực tiếp qua yourRole)
        if (data.yourRole) {
            playerRole = data.yourRole;
            if (playerRole === 'white') {
                board.setOrientation('white');
            } else if (playerRole === 'black') {
                board.setOrientation('black');
            }
        } else {
            const isWhite = (Number(data.whitePlayerId) === Number(currentUser.id)) || (data.whitePlayerName && data.whitePlayerName === currentUser.username);
            const isBlack = (Number(data.blackPlayerId) === Number(currentUser.id)) || (data.blackPlayerName && data.blackPlayerName === currentUser.username);

            if (isWhite) {
                playerRole = 'white';
                board.setOrientation('white');
            } else if (isBlack) {
                playerRole = 'black';
                board.setOrientation('black');
            } else {
                playerRole = 'spectator';
            }
        }

        if (playerRole === 'black') {
            myReadyState = opponentReady;
        }

        updatePlayerLabels(data.whitePlayerName, data.blackPlayerName);

        // Nạp FEN và lịch sử nước đi
        if (data.fen) {
            try {
                chess.load(data.fen);
            } catch (e) {
                console.warn('[Socket] Không thể nạp FEN vào chess.js:', e.message);
            }
            board.setPosition(data.fen);
        }

        if (data.history && data.history.length > 0) {
            currentMatchMoveHistory = [...data.history];
            renderMoveHistory(data.history);
        }

        // Nạp lịch sử chat
        if (data.chatHistory && data.chatHistory.length > 0) {
            renderChatHistory(data.chatHistory);
        }

        updateTurnIndicator();
        updateStagingUI();

        // Chỉ tính giờ khi trận đấu ĐÃ BẮT ĐẦU và chưa kết thúc
        const hasOpponent = data.blackPlayerId && data.blackPlayerName && !data.blackPlayerName.includes('Đang chờ đối thủ');
        if (hasOpponent && isGameStarted && !isGameOver) {
            startClock();
        } else {
            stopClock();
            whiteTime = 600;
            blackTime = 600;
            updateClockDisplay();
        }

        if (isGameOver) {
            handleGameOverDisplay(data.result, 'Trận đấu đã kết thúc');
        }
    });

    // Nhận thông báo đối thủ vào phòng
    socket.on('opponentJoined', (data) => {
        console.log('[Socket] Đối thủ đã vào phòng:', data);
        showToast(`🎉 ${data.blackPlayerName} đã tham gia với vai trò Quân Đen!`, 'success');
        try { ChessAudio.playNotify(); } catch (e) {}
        if (playerRole === 'white') {
            const oppNameEl = document.getElementById('opponent-name');
            if (oppNameEl) oppNameEl.textContent = data.blackPlayerName;
        }
        opponentReady = Boolean(data.opponentReady);
        isGameStarted = Boolean(data.isGameStarted);
        if (playerRole === 'black') {
            myReadyState = opponentReady;
        }
        updateTurnIndicator();
        updateStagingUI();
    });

    // Trạng thái Sẵn sàng của Đối thủ thay đổi
    socket.on('readyStatusChanged', (data) => {
        opponentReady = Boolean(data.opponentReady);
        if (playerRole === 'black') {
            myReadyState = opponentReady;
        }
        updateStagingUI();
        if (isHost) {
            if (opponentReady) {
                showToast(`⚡ ${data.username || 'Đối thủ'} đã SẴN SÀNG! Bạn có thể bắt đầu trận đấu.`, 'success');
                try { ChessAudio.playNotify(); } catch (e) {}
            } else {
                showToast(`ℹ️ ${data.username || 'Đối thủ'} đã hủy trạng thái sẵn sàng.`, 'info');
            }
        }
    });

    // Trận đấu chính thức bắt đầu bởi Chủ phòng
    socket.on('gameStarted', (data) => {
        isGameStarted = true;
        updateStagingUI();
        startClock();
        resetTurnTimer();
        updateTurnIndicator();
        showToast(data.message || 'Trận đấu đã chính thức bắt đầu! Chúc hai kỳ thủ thi đấu tốt!', 'success');
        try { ChessAudio.playNotify(); } catch (e) {}
    });

    // Bị chủ phòng kick ra khỏi phòng
    socket.on('kicked', (data) => {
        alert(data.message || 'Bạn đã bị chủ phòng mời ra khỏi phòng chơi!');
        window.location.href = '/pages/rooms.html';
    });

    // Đối thủ bị kick (thông báo cho chủ phòng và các người xem)
    socket.on('opponentKicked', (data) => {
        showToast(data.message || 'Chủ phòng đã mời đối thủ ra khỏi phòng.', 'info');
        const oppNameEl = document.getElementById('opponent-name');
        if (oppNameEl) oppNameEl.textContent = 'Đang chờ đối thủ...';
        opponentReady = false;
        isGameStarted = false;
        myReadyState = false;
        stopClock();
        whiteTime = 600;
        blackTime = 600;
        updateClockDisplay();
        updateTurnIndicator();
        updateStagingUI();
    });

    // Nhận yêu cầu đánh lại (Rematch) từ đối thủ
    socket.on('rematchRequested', (data) => {
        const modal = document.getElementById('rematch-request-modal');
        const requesterText = document.getElementById('rematch-requester-text');
        if (requesterText) {
            requesterText.textContent = `${data.requesterName || 'Đối thủ'} muốn tái đấu một ván mới và đổi bên cờ. Bạn có đồng ý không?`;
        }
        if (modal) modal.classList.add('active');
        try { ChessAudio.playNotify(); } catch (e) {}
    });

    // Đối thủ từ chối đánh lại
    socket.on('rematchDeclined', (data) => {
        showToast(`${data.declinerName || 'Đối thủ'} đã từ chối yêu cầu đánh lại.`, 'warning');
        const rematchBtn = document.getElementById('btn-rematch-action');
        if (rematchBtn) {
            rematchBtn.disabled = false;
            rematchBtn.innerHTML = '<i class="fas fa-redo-alt"></i> Yêu cầu đánh lại';
        }
    });

    // Hai bên đồng ý đánh lại -> Bắt đầu ván mới
    socket.on('rematchAccepted', (data) => {
        const gameOverModal = document.getElementById('game-over-modal');
        if (gameOverModal) gameOverModal.classList.remove('active');
        const rematchModal = document.getElementById('rematch-request-modal');
        if (rematchModal) rematchModal.classList.remove('active');
        const rematchBtn = document.getElementById('btn-rematch-action');
        if (rematchBtn) {
            rematchBtn.disabled = false;
            rematchBtn.innerHTML = '<i class="fas fa-redo-alt"></i> Yêu cầu đánh lại';
        }

        // Đặt lại bàn cờ và ván cờ
        isGameOver = false;
        isGameStarted = true;
        whiteTime = 600;
        blackTime = 600;

        chess.load(data.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        board.setPosition(chess.fen());
        board.clearHighlights();
        board.clearLegalMoves();
        board.clearCheck();

        // Cập nhật lại vai trò đổi bên
        if (Number(currentUser.id) === Number(data.whitePlayerId)) {
            playerRole = 'white';
            board.setOrientation('white');
        } else if (Number(currentUser.id) === Number(data.blackPlayerId)) {
            playerRole = 'black';
            board.setOrientation('black');
        }

        updatePlayerLabels(data.whitePlayerName, data.blackPlayerName);
        currentMatchMoveHistory = [];
        renderMoveHistory([]);
        updateClockDisplay();
        resetTurnTimer();
        updateTurnIndicator();
        startClock();
        updateStagingUI();

        showToast('🔥 Trận tái đấu đã bắt đầu! Đã đổi bên quân cờ.', 'success');
        try { ChessAudio.playNotify(); } catch (e) {}
    });

    // Phòng không tồn tại
    socket.on('roomNotFound', (data) => {
        showToast(data.message || 'Không tìm thấy phòng chơi này!', 'error');
        const badge = document.getElementById('turn-status-badge');
        if (badge) {
            badge.textContent = 'Phòng không tồn tại';
            badge.className = 'badge badge-loss';
        }
    });

    // Có người chơi mới tham gia phòng
    socket.on('playerJoined', (data) => {
        showToast(data.message, 'info');
        // Tải lại chi tiết phòng để cập nhật tên đối thủ
        fetchRoomDetails();
    });

    // Người chơi rời phòng
    socket.on('playerLeft', (data) => {
        showToast(data.message, 'warning');
    });

    // Đối thủ mất kết nối đột ngột -> Chờ 15 giây kết nối lại
    socket.on('playerDisconnectedWaiting', (data) => {
        showToast(`⚠️ ${data.message}`, 'warning');
        const badge = document.getElementById('turn-status-badge');
        if (badge) {
            badge.textContent = `Đối thủ mất kết nối (chờ 15s...)`;
            badge.className = 'badge badge-loss';
        }
    });

    // Nhận nhịp đếm 10 giây mỗi lượt từ máy chủ
    socket.on('turnTick', (data) => {
        if (isGameOver || !isGameStarted) return;
        turnTimeLeft = data.timeLeft;
        updateTurnTimerDisplay(turnTimeLeft);
    });

    // Đối thủ đã kết nối lại kịp thời
    socket.on('playerReconnected', (data) => {
        showToast(`🎉 ${data.message}`, 'success');
        updateTurnIndicator();
    });

    // Đối thủ thoát khi ván cờ chưa bắt đầu -> trở lại trạng thái chờ
    socket.on('opponentLeftWaiting', (data) => {
        showToast(data.message, 'info');
        const oppNameEl = document.getElementById('opponent-name');
        if (oppNameEl) oppNameEl.textContent = 'Đang chờ đối thủ...';
        opponentReady = false;
        isGameStarted = false;
        myReadyState = false;
        stopClock();
        whiteTime = 600;
        blackTime = 600;
        updateClockDisplay();
        updateTurnIndicator();
        updateStagingUI();
    });

    // Nhận nước đi từ đối thủ hoặc do hệ thống tự đánh khi quá 10 giây
    socket.on('move', (data) => {
        console.log('[Socket] Nhận nước đi:', data);
        try {
            chess.load(data.fen);
        } catch (e) {
            console.warn('[Socket] Không thể nạp FEN (vua có thể đã bị bắt):', e.message);
        }
        board.setPosition(data.fen);

        if (data.move) {
            board.setLastMove(data.move.from, data.move.to);
            if (data.move.captured) {
                ChessAudio.playCapture();
            } else {
                ChessAudio.playMove();
            }
        }

        // Nếu là nước đi do hết 10 giây hệ thống tự động đi
        if (data.isAutoMove) {
            showToast(`⏱️ ${data.message || 'Quá 10 giây! Hệ thống đã tự động đánh nước cờ và đổi lượt.'}`, 'warning');
        }

        resetTurnTimer();

        const isKingCaptured = data.isKingCaptured || (data.move && (data.move.captured === 'k' || data.move.captured === 'K'));
        if (isKingCaptured) {
            isGameOver = true;
            stopClock();
            stopTurnTimer();
            ChessAudio.playGameOver();
            const winningColor = data.move ? data.move.color : (chess.turn() === 'w' ? 'b' : 'w');
            const result = winningColor === 'w' ? 'white_win' : 'black_win';
            const reason = winningColor === 'w' 
                ? 'Bên Đen bị mất quân Vua và bị xử THUA! Bên Trắng giành CHIẾN THẮNG!' 
                : 'Bên Trắng bị mất quân Vua và bị xử THUA! Bên Đen giành CHIẾN THẮNG!';
            handleGameOverDisplay(result, reason);
            return;
        }

        // Kiểm tra chiếu vua
        try {
            if (chess.inCheck()) {
                ChessAudio.playCheck();
                const kingSquare = findKingSquare(chess.turn());
                if (kingSquare) board.setCheck(kingSquare);
            } else {
                board.clearCheck();
            }
        } catch (e) {
            board.clearCheck();
        }

        if (data.history) {
            currentMatchMoveHistory = [...data.history];
            renderMoveHistory(data.history);
        } else if (data.move && data.move.san) {
            currentMatchMoveHistory.push(data.move.san);
        }

        updateTurnIndicator();
    });

    // Nhận thông báo kết thúc trận
    socket.on('gameOver', (data) => {
        isGameOver = true;
        stopClock();
        stopTurnTimer();
        ChessAudio.playGameOver();
        handleGameOverDisplay(data.result, data.reason);
    });

    // Nhận tin nhắn chat
    socket.on('chatMessage', (data) => {
        appendChatMessage(data);
        if (Number(data.userId) !== Number(currentUser.id)) {
            ChessAudio.playNotify();
        }
    });

    // Nhận đề nghị hòa
    socket.on('drawOffered', (data) => {
        if (confirm(`${data.username} gửi lời đề nghị HÒA ván cờ. Bạn có đồng ý không?`)) {
            socket.emit('respondDraw', { roomCode, accepted: true });
        } else {
            socket.emit('respondDraw', { roomCode, accepted: false });
        }
    });

    socket.on('drawDeclined', (data) => {
        showToast(data.message, 'warning');
    });

    // WebRTC Signaling
    socket.on('videoSignal', (signal) => {
        handleVideoSignal(signal);
    });

    socket.on('error', (msg) => {
        showToast(msg, 'error');
    });
}

// Lấy thông tin phòng qua REST API để cập nhật giao diện
async function fetchRoomDetails() {
    try {
        const res = await fetch(`/api/rooms/${roomCode}`);
        if (!res.ok) return;
        const data = await res.json();
        const whiteName = data.whitePlayer ? data.whitePlayer.username : (data.game?.white_player_name || 'Đang chờ...');
        const blackName = data.blackPlayer ? data.blackPlayer.username : (data.game?.black_player_name || 'Đang chờ đối thủ...');
        updatePlayerLabels(whiteName, blackName);
    } catch (e) {}
}

function updatePlayerLabels(whiteName, blackName) {
    const isPlayerWhite = (playerRole === 'white');

    const topNameEl = document.getElementById('opponent-name');
    const bottomNameEl = document.getElementById('self-name');
    const topRoleEl = document.getElementById('opponent-role');
    const bottomRoleEl = document.getElementById('self-role');
    const topAvatarEl = document.getElementById('opponent-avatar');
    const bottomAvatarEl = document.getElementById('self-avatar');

    if (isPlayerWhite) {
        // Bản thân là Trắng (ở dưới), Đối thủ là Đen (ở trên)
        if (bottomNameEl) bottomNameEl.textContent = whiteName + ' (Bạn)';
        if (bottomRoleEl) bottomRoleEl.textContent = 'Quân Trắng';
        if (bottomAvatarEl) { bottomAvatarEl.className = 'player-avatar white'; bottomAvatarEl.innerHTML = '♔'; }

        if (topNameEl) topNameEl.textContent = blackName;
        if (topRoleEl) topRoleEl.textContent = 'Quân Đen';
        if (topAvatarEl) { topAvatarEl.className = 'player-avatar black'; topAvatarEl.innerHTML = '♚'; }
    } else {
        // Bản thân là Đen (ở dưới), Đối thủ là Trắng (ở trên)
        if (bottomNameEl) bottomNameEl.textContent = blackName + ' (Bạn)';
        if (bottomRoleEl) bottomRoleEl.textContent = 'Quân Đen';
        if (bottomAvatarEl) { bottomAvatarEl.className = 'player-avatar black'; bottomAvatarEl.innerHTML = '♚'; }

        if (topNameEl) topNameEl.textContent = whiteName;
        if (topRoleEl) topRoleEl.textContent = 'Quân Trắng';
        if (topAvatarEl) { topAvatarEl.className = 'player-avatar white'; topAvatarEl.innerHTML = '♔'; }
    }
}

function updateStagingUI() {
    const stagingBar = document.getElementById('room-staging-bar');
    const statusText = document.getElementById('staging-status-text');
    const stagingIcon = document.getElementById('staging-icon');
    const btnHostStart = document.getElementById('btn-host-start');
    const btnHostKick = document.getElementById('btn-host-kick');
    const btnOpponentReady = document.getElementById('btn-opponent-ready');
    const oppReadyBadge = document.getElementById('opponent-ready-badge');
    const selfReadyBadge = document.getElementById('self-ready-badge');

    if (!stagingBar) return;

    // Nếu ván cờ đã bắt đầu hoặc đã kết thúc, ẩn thanh staging
    if (isGameStarted) {
        stagingBar.style.display = 'none';
        if (oppReadyBadge) oppReadyBadge.style.display = 'none';
        if (selfReadyBadge) selfReadyBadge.style.display = 'none';
        return;
    }

    // Ván cờ chưa bắt đầu -> Hiện thanh staging
    stagingBar.style.display = 'flex';
    const hasOpponent = hasOpponentJoined();

    if (isHost) {
        // Mình là Chủ phòng
        if (btnOpponentReady) btnOpponentReady.style.display = 'none';
        if (selfReadyBadge) selfReadyBadge.style.display = 'none';

        if (!hasOpponent) {
            // Chưa có đối thủ
            if (statusText) statusText.textContent = 'Bạn là Chủ phòng. Đang chờ đối thủ vào phòng...';
            if (stagingIcon) stagingIcon.className = 'fas fa-spinner fa-spin';
            if (btnHostStart) {
                btnHostStart.style.display = 'inline-flex';
                btnHostStart.disabled = true;
                btnHostStart.classList.remove('pulse-ready');
                btnHostStart.title = 'Chờ đối thủ tham gia và bấm sẵn sàng...';
            }
            if (btnHostKick) btnHostKick.style.display = 'none';
            if (oppReadyBadge) oppReadyBadge.style.display = 'none';
        } else {
            // Đã có đối thủ
            if (btnHostKick) btnHostKick.style.display = 'inline-flex';
            if (oppReadyBadge) {
                oppReadyBadge.style.display = 'inline-flex';
                if (opponentReady) {
                    oppReadyBadge.className = 'ready-badge ready';
                    oppReadyBadge.innerHTML = '<i class="fas fa-check"></i> Đã sẵn sàng';
                } else {
                    oppReadyBadge.className = 'ready-badge not-ready';
                    oppReadyBadge.innerHTML = '<i class="fas fa-clock"></i> Chưa sẵn sàng';
                }
            }

            if (btnHostStart) {
                btnHostStart.style.display = 'inline-flex';
                if (opponentReady) {
                    btnHostStart.disabled = false;
                    btnHostStart.classList.add('pulse-ready');
                    btnHostStart.title = 'Bấm để bắt đầu trận đấu ngay!';
                    if (statusText) statusText.textContent = 'Đối thủ đã SẴN SÀNG! Bạn có thể bắt đầu trận đấu.';
                    if (stagingIcon) stagingIcon.className = 'fas fa-check-circle';
                } else {
                    btnHostStart.disabled = true;
                    btnHostStart.classList.remove('pulse-ready');
                    btnHostStart.title = 'Đang chờ đối thủ bấm Sẵn sàng...';
                    if (statusText) statusText.textContent = 'Đối thủ đã vào phòng. Đang chờ đối thủ Sẵn sàng...';
                    if (stagingIcon) stagingIcon.className = 'fas fa-hourglass-half';
                }
            }
        }
    } else if (playerRole === 'black') {
        // Mình là Đối thủ (Quân Đen)
        if (btnHostStart) btnHostStart.style.display = 'none';
        if (btnHostKick) btnHostKick.style.display = 'none';
        if (btnOpponentReady) btnOpponentReady.style.display = 'inline-flex';
        if (oppReadyBadge) oppReadyBadge.style.display = 'none';

        if (selfReadyBadge) {
            selfReadyBadge.style.display = 'inline-flex';
            if (myReadyState) {
                selfReadyBadge.className = 'ready-badge ready';
                selfReadyBadge.innerHTML = '<i class="fas fa-check"></i> Đã sẵn sàng';
            } else {
                selfReadyBadge.className = 'ready-badge not-ready';
                selfReadyBadge.innerHTML = '<i class="fas fa-clock"></i> Chưa sẵn sàng';
            }
        }

        if (myReadyState) {
            if (btnOpponentReady) {
                btnOpponentReady.className = 'btn btn-success btn-sm btn-ready-active';
                btnOpponentReady.innerHTML = '<i class="fas fa-check-circle"></i> Đã sẵn sàng (Bấm để hủy)';
            }
            if (statusText) statusText.textContent = 'Bạn đã sẵn sàng! Đang chờ Chủ phòng bắt đầu trận...';
            if (stagingIcon) stagingIcon.className = 'fas fa-spinner fa-spin';
        } else {
            if (btnOpponentReady) {
                btnOpponentReady.className = 'btn btn-warning btn-sm';
                btnOpponentReady.innerHTML = '<i class="fas fa-check-circle"></i> Sẵn sàng';
            }
            if (statusText) statusText.textContent = 'Vui lòng bấm "Sẵn sàng" để Chủ phòng bắt đầu ván cờ!';
            if (stagingIcon) stagingIcon.className = 'fas fa-info-circle';
        }
    } else {
        // Khán giả (Spectator)
        if (btnHostStart) btnHostStart.style.display = 'none';
        if (btnHostKick) btnHostKick.style.display = 'none';
        if (btnOpponentReady) btnOpponentReady.style.display = 'none';
        if (statusText) statusText.textContent = 'Đang chờ hai kỳ thủ sẵn sàng và bắt đầu...';
        if (stagingIcon) stagingIcon.className = 'fas fa-eye';
    }
}

function updateTurnIndicator() {
    const turn = chess.turn(); // 'w' hoặc 'b'
    const isWhiteTurn = turn === 'w';

    const topCard = document.getElementById('opponent-card');
    const bottomCard = document.getElementById('self-card');
    const badge = document.getElementById('turn-status-badge');

    const isPlayerWhite = (playerRole === 'white');

    // Nếu ván cờ chưa bắt đầu
    if (!isGameStarted) {
        if (badge) {
            badge.textContent = 'Chờ bắt đầu trận';
            badge.className = 'badge badge-draw';
        }
        if (bottomCard) bottomCard.classList.remove('active-turn');
        if (topCard) topCard.classList.remove('active-turn');
        return;
    }

    // Nếu là Trắng nhưng Đen chưa vào phòng
    const oppName = document.getElementById('opponent-name')?.textContent;
    if (playerRole === 'white' && oppName && oppName.includes('Đang chờ đối thủ')) {
        if (badge) {
            badge.textContent = 'Đang chờ đối thủ vào phòng...';
            badge.className = 'badge badge-draw';
        }
        if (bottomCard) bottomCard.classList.remove('active-turn');
        if (topCard) topCard.classList.remove('active-turn');
        return;
    }

    if ((isWhiteTurn && isPlayerWhite) || (!isWhiteTurn && !isPlayerWhite)) {
        // Đến lượt bản thân
        if (bottomCard) bottomCard.classList.add('active-turn');
        if (topCard) topCard.classList.remove('active-turn');
        if (badge) {
            badge.textContent = 'Lượt của bạn';
            badge.className = 'badge badge-win';
        }
    } else {
        // Đến lượt đối thủ
        if (topCard) topCard.classList.add('active-turn');
        if (bottomCard) bottomCard.classList.remove('active-turn');
        if (badge) {
            badge.textContent = 'Lượt đối thủ';
            badge.className = 'badge badge-draw';
        }
    }
}

// ================= NƯỚC ĐI VÀ LUẬT CHƠI =================
function handleSquareSelect(square, pieceKey) {
    if (isGameOver || isReplayMode) return;
    if (!isGameStarted) {
        board.clearLegalMoves();
        return;
    }

    // Kiểm tra xem có đúng lượt và đúng quân của mình không
    const turn = chess.turn();
    if ((turn === 'w' && playerRole !== 'white') || (turn === 'b' && playerRole !== 'black')) {
        board.clearLegalMoves();
        return;
    }

    if (!square) {
        board.clearLegalMoves();
        return;
    }

    // Lấy các nước đi hợp lệ của ô này từ chess.js
    const moves = chess.moves({ square, verbose: true });
    board.setLegalMoves(moves);
}

function handlePlayerMove({ from, to, promotion }) {
    if (isGameOver || isReplayMode) {
        showToast('Ván cờ đã kết thúc hoặc đang ở chế độ xem lại', 'warning');
        return false;
    }

    if (!isGameStarted) {
        showToast('Trận đấu chưa bắt đầu! Hãy chờ chủ phòng bấm "Bắt đầu trận".', 'warning');
        board.setPosition(chess.fen());
        return false;
    }

    if (playerRole === 'white') {
        const oppName = document.getElementById('opponent-name')?.textContent || '';
        if (oppName.includes('Đang chờ đối thủ')) {
            showToast('Vui lòng đợi bạn bè tham gia phòng trước khi đi cờ!', 'warning');
            board.setPosition(chess.fen());
            return false;
        }
    }

    const turn = chess.turn();
    if ((turn === 'w' && playerRole !== 'white') || (turn === 'b' && playerRole !== 'black')) {
        showToast('Chưa đến lượt đi của bạn!', 'error');
        board.setPosition(chess.fen());
        return false;
    }

    // Thử đi cờ trên chess.js
    try {
        const moveObj = { from, to, promotion: promotion || 'q' };
        const result = chess.move(moveObj);

        if (!result) {
            board.setPosition(chess.fen());
            return false;
        }

        if (result && result.san) {
            currentMatchMoveHistory.push(result.san);
        }

        const isKingCaptured = (result.captured === 'k' || result.captured === 'K');

        // Hoàn tất nước đi hợp lệ -> Gửi lên Server qua Socket
        socket.emit('move', {
            roomCode,
            move: moveObj,
            userId: currentUser.id
        });

        // Cập nhật giao diện lập tức
        board.setPosition(chess.fen());
        board.setLastMove(from, to);

        if (result.captured) ChessAudio.playCapture();
        else ChessAudio.playMove();

        if (isKingCaptured) {
            isGameOver = true;
            stopClock();
            stopTurnTimer();
            ChessAudio.playGameOver();
            const resultColor = (playerRole === 'white') ? 'white_win' : 'black_win';
            const reason = (playerRole === 'white')
                ? 'Bên Đen bị mất quân Vua và bị xử THUA! Bên Trắng giành CHIẾN THẮNG!'
                : 'Bên Trắng bị mất quân Vua và bị xử THUA! Bên Đen giành CHIẾN THẮNG!';
            handleGameOverDisplay(resultColor, reason);
            return true;
        }

        try {
            if (chess.inCheck()) {
                ChessAudio.playCheck();
                const kingSquare = findKingSquare(chess.turn());
                if (kingSquare) board.setCheck(kingSquare);
            } else {
                board.clearCheck();
            }
        } catch (e) {
            board.clearCheck();
        }

        updateTurnIndicator();
        return true;
    } catch (e) {
        board.setPosition(chess.fen());
        return false;
    }
}

function findKingSquare(color) {
    const boardArr = chess.board();
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
            const p = boardArr[r][f];
            if (p && p.type === 'k' && p.color === color) {
                return files[f] + (8 - r);
            }
        }
    }
    return null;
}

// Hiển thị lịch sử nước đi
function renderMoveHistory(history) {
    const tbody = document.getElementById('moves-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
        const tr = document.createElement('tr');
        const moveNum = Math.floor(i / 2) + 1;
        const whiteMove = history[i] || '';
        const blackMove = history[i + 1] || '';

        tr.innerHTML = `
            <td class="move-num">${moveNum}.</td>
            <td class="move-white">${whiteMove}</td>
            <td class="move-black">${blackMove}</td>
        `;
        tbody.appendChild(tr);
    }

    const container = document.querySelector('.moves-table-container');
    if (container) container.scrollTop = container.scrollHeight;
}

function hasOpponentJoined() {
    const oppName = document.getElementById('opponent-name')?.textContent || '';
    return oppName && !oppName.includes('Đang chờ đối thủ');
}

// Đồng hồ đếm ngược 30 giây mỗi lượt (quá 30s xử thua, đồng bộ với nhịp tick máy chủ)
function updateTurnTimerDisplay(seconds) {
    const badge = document.getElementById('turn-timer-badge');
    const textEl = document.getElementById('turn-seconds-left');
    if (badge) {
        badge.style.display = (isGameStarted && !isGameOver) ? 'inline-flex' : 'none';
        if (seconds <= 5) {
            badge.classList.add('urgent');
        } else {
            badge.classList.remove('urgent');
        }
    }
    if (textEl) {
        textEl.textContent = Math.max(0, seconds);
    }

    // Cập nhật đồng hồ của người chơi đang đến lượt (định dạng 00:XX)
    const turn = chess ? chess.turn() : 'w';
    const isPlayerWhite = (playerRole === 'white');
    const isMyTurn = (turn === 'w' && isPlayerWhite) || (turn === 'b' && !isPlayerWhite);

    const selfClock = document.getElementById('self-clock');
    const oppClock = document.getElementById('opponent-clock');

    const fmtTurn = (sec) => {
        const s = Math.max(0, sec).toString().padStart(2, '0');
        return `00:${s}`;
    };

    if (isMyTurn) {
        if (selfClock) {
            selfClock.textContent = fmtTurn(seconds);
            selfClock.classList.toggle('low-time', seconds <= 5);
        }
        if (oppClock) {
            oppClock.textContent = '00:30';
            oppClock.classList.remove('low-time');
        }
    } else {
        if (oppClock) {
            oppClock.textContent = fmtTurn(seconds);
            oppClock.classList.toggle('low-time', seconds <= 5);
        }
        if (selfClock) {
            selfClock.textContent = '00:30';
            selfClock.classList.remove('low-time');
        }
    }

    if (board && board.updateEvalBar) {
        board.updateEvalBar(evaluateSimpleBoard());
    }
}

function resetTurnTimer() {
    turnTimeLeft = 30;
    updateTurnTimerDisplay(turnTimeLeft);
}

function stopTurnTimer() {
    const badge = document.getElementById('turn-timer-badge');
    if (badge) badge.style.display = 'none';
    const selfClock = document.getElementById('self-clock');
    const oppClock = document.getElementById('opponent-clock');
    if (selfClock) selfClock.classList.remove('low-time');
    if (oppClock) oppClock.classList.remove('low-time');
}

function startClock() {
    resetTurnTimer();
}

function stopClock() {
    stopTurnTimer();
    if (clockInterval) clearInterval(clockInterval);
}

function evaluateSimpleBoard() {
    if (!chess) return 0;
    const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    let score = 0;
    const b = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = b[r][c];
            if (p) {
                const val = pieceValues[p.type] || 0;
                score += (p.color === 'w') ? val : -val;
            }
        }
    }
    return score;
}

function updateClockDisplay() {
    updateTurnTimerDisplay(turnTimeLeft);
}

// Modal kết thúc trận
function handleGameOverDisplay(result, reason) {
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const msg = document.getElementById('game-over-reason');

    stopTurnTimer();
    stopClock();

    const isIWhite = (playerRole === 'white');
    const isIBlack = (playerRole === 'black');
    const isWin = (result === 'white_win' && isIWhite) || (result === 'black_win' && isIBlack);
    const isLose = (result === 'white_win' && isIBlack) || (result === 'black_win' && isIWhite);

    let titleText = 'Ván cờ kết thúc!';
    if (isWin) {
        titleText = '🏆 BẠN ĐÃ CHIẾN THẮNG!';
    } else if (isLose) {
        titleText = '❌ BẠN ĐÃ BỊ XỬ THUA!';
    } else if (result === 'white_win') {
        titleText = 'BÊN TRẮNG CHIẾN THẮNG!';
    } else if (result === 'black_win') {
        titleText = 'BÊN ĐEN CHIẾN THẮNG!';
    } else if (result === 'draw') {
        titleText = '🤝 KẾT QUẢ HÒA CỜ!';
    }

    if (title) title.textContent = titleText;
    if (msg) msg.textContent = reason || '';
    const rematchBtn = document.getElementById('btn-rematch-action');
    if (rematchBtn) {
        rematchBtn.disabled = false;
        rematchBtn.innerHTML = '<i class="fas fa-redo-alt"></i> Yêu cầu đánh lại';
    }
    const stagingBar = document.getElementById('room-staging-bar');
    if (stagingBar) stagingBar.style.display = 'none';
    if (modal) modal.classList.add('active');
}

// ================= KHUNG CHAT =================
function renderChatHistory(history) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = '';
    history.forEach(appendChatMessage);
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const isMine = Number(msg.userId || msg.sender_id) === Number(currentUser.id);
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'theirs'}`;

    const sender = isMine ? 'Bạn' : (msg.username || 'Đối thủ');
    const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    bubble.innerHTML = `
        <div class="chat-meta"><strong>${sender}</strong> <span>${timeStr}</span></div>
        <div>${escapeHtml(msg.message)}</div>
    `;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

// ================= WEBRTC VIDEO CALL =================
let pendingIceCandidates = [];

function switchToVideoTab() {
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(t => {
        if (t.dataset.target === 'tab-video') {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        if (c.id === 'tab-video') {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
}

// Hàm lấy stream media an toàn (ưu tiên Video+Audio, tự động fallback sang Audio nếu không có webcam)
async function acquireMediaStream() {
    try {
        return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (videoErr) {
        console.warn('Không thể truy cập camera, thử chế độ âm thanh (Micro):', videoErr);
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            showToast('Đang kết nối chế độ thoại âm thanh (Thiết bị không có Webcam)', 'info');
            return audioStream;
        } catch (audioErr) {
            throw videoErr;
        }
    }
}

async function startVideoCall() {
    if (!socket || !socket.connected) {
        showToast('Chưa kết nối tới máy chủ thời gian thực để gọi video!', 'warning');
        return;
    }

    if (!hasOpponentJoined()) {
        showToast('Đang chờ đối thủ tham gia phòng trước khi bắt đầu Video Call!', 'warning');
        return;
    }

    try {
        pendingIceCandidates = [];
        localStream = await acquireMediaStream();
        const localVideo = document.getElementById('local-video');
        if (localVideo) localVideo.srcObject = localStream;

        const startBtn = document.getElementById('start-call-btn');
        if (startBtn) startBtn.style.display = 'none';
        const ctrlBar = document.getElementById('video-controls-bar');
        if (ctrlBar) ctrlBar.style.display = 'flex';

        createPeerConnection();
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        // Tạo SDP Offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('videoSignal', {
            roomCode,
            signal: { type: 'offer', sdp: offer }
        });

        showToast('Đang gọi cho đối thủ...', 'info');
    } catch (err) {
        console.error('Lỗi truy cập camera/micro:', err);
        showToast('Không thể bật camera/micro (kiểm tra quyền truy cập thiết bị)', 'error');
    }
}

function createPeerConnection() {
    if (peerConnection) return;
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket && socket.connected) {
            socket.emit('videoSignal', {
                roomCode,
                signal: { type: 'candidate', candidate: event.candidate }
            });
        }
    };

    peerConnection.ontrack = (event) => {
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            showToast('Đã nhận luồng hình ảnh của đối thủ!', 'success');
        }
    };
}

async function handleVideoSignal(signal) {
    try {
        if (signal.type === 'offer') {
            // Tự động chuyển người nhận sang tab Video Call
            switchToVideoTab();
            if (typeof ChessAudio !== 'undefined' && ChessAudio.playNotify) {
                ChessAudio.playNotify();
            }

            if (!localStream) {
                try {
                    localStream = await acquireMediaStream();
                    const localVideo = document.getElementById('local-video');
                    if (localVideo) localVideo.srcObject = localStream;
                    const startBtn = document.getElementById('start-call-btn');
                    if (startBtn) startBtn.style.display = 'none';
                    const ctrlBar = document.getElementById('video-controls-bar');
                    if (ctrlBar) ctrlBar.style.display = 'flex';
                } catch (e) {
                    showToast('Đối thủ đang gọi video nhưng bạn chưa cấp quyền camera/micro', 'warning');
                    return;
                }
            }

            createPeerConnection();
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));

            // Xử lý các ICE candidate đã tích lũy trong hàng đợi
            while (pendingIceCandidates.length > 0) {
                const cand = pendingIceCandidates.shift();
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
                } catch (candErr) {
                    console.warn('[WebRTC] flush candidate error:', candErr);
                }
            }

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            if (socket && socket.connected) {
                socket.emit('videoSignal', {
                    roomCode,
                    signal: { type: 'answer', sdp: answer }
                });
            }
            showToast('Đã kết nối cuộc gọi video!', 'success');
        } else if (signal.type === 'answer') {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));

                // Xử lý các ICE candidate đã tích lũy trong hàng đợi
                while (pendingIceCandidates.length > 0) {
                    const cand = pendingIceCandidates.shift();
                    try {
                        await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
                    } catch (candErr) {
                        console.warn('[WebRTC] flush candidate error:', candErr);
                    }
                }

                showToast('Đối thủ đã trả lời cuộc gọi!', 'success');
            }
        } else if (signal.type === 'candidate') {
            if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } catch (iceErr) {
                    console.warn('[WebRTC] addIceCandidate error:', iceErr);
                }
            } else {
                pendingIceCandidates.push(signal.candidate);
            }
        } else if (signal.type === 'end-call') {
            endVideoCall(false);
            showToast('Đối thủ đã kết thúc cuộc gọi', 'info');
        }
    } catch (err) {
        console.error('Lỗi tín hiệu video:', err);
    }
}

function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        isMicMuted = !audioTrack.enabled;
        const btn = document.getElementById('toggle-mic-btn');
        btn.classList.toggle('active', isMicMuted);
        btn.innerHTML = isMicMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    }
}

function toggleCam() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        isCamOff = !videoTrack.enabled;
        const btn = document.getElementById('toggle-cam-btn');
        btn.classList.toggle('active', isCamOff);
        btn.innerHTML = isCamOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
    }
}

function endVideoCall(notify = true) {
    if (notify && socket) {
        socket.emit('videoSignal', { roomCode, signal: { type: 'end-call' } });
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localStream = null;
    }
    const localVideo = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;

    document.getElementById('start-call-btn').style.display = 'inline-flex';
    document.getElementById('video-controls-bar').style.display = 'none';
}

// ================= GẮN SỰ KIỆN UI =================
function attachUIEvents() {
    // Chuyển Tab bên phải (Nước đi / Chat / Video)
    const tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            tab.classList.add('active');
            const targetId = tab.dataset.target;
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    // Lật bàn cờ
    const flipBtn = document.getElementById('flip-board-btn');
    if (flipBtn) {
        flipBtn.addEventListener('click', () => {
            if (board) board.flip();
        });
    }

    // Sao chép link mời bạn bè
    const copyLinkBtn = document.getElementById('copy-room-link-btn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', async () => {
            let shareUrl = `${window.location.origin}/pages/game.html?room=${roomCode}&join=1`;

            // Lấy thông tin IP mạng LAN (cổng 3000) để thiết bị 2 (điện thoại/máy tính khác cùng Wi-Fi) kết nối trực tiếp
            try {
                const res = await fetch('/api/server-info');
                if (res.ok) {
                    const info = await res.json();
                    if (info.ip && info.ip !== '127.0.0.1') {
                        shareUrl = `http://${info.ip}:3000/pages/game.html?room=${roomCode}&join=1`;
                    }
                }
            } catch (e) {}

            navigator.clipboard.writeText(shareUrl).then(() => {
                showToast(`Đã sao chép link mời bạn bè (thiết bị 2): ${shareUrl}`, 'success');
            }).catch(() => {
                prompt('Sao chép đường dẫn này gửi cho bạn bè:', shareUrl);
            });
        });
    }

    // Bấm vào mã phòng để sao chép mã
    const codeEl = document.getElementById('display-room-code');
    if (codeEl) {
        codeEl.addEventListener('click', () => {
            navigator.clipboard.writeText(roomCode).then(() => {
                showToast(`Đã sao chép mã phòng: ${roomCode}`, 'success');
            });
        });
    }

    // Cầu hòa
    const drawBtn = document.getElementById('draw-btn');
    if (drawBtn) {
        drawBtn.addEventListener('click', () => {
            if (isGameOver) return;
            if (!socket || !socket.connected) {
                showToast('Chưa kết nối tới máy chủ thời gian thực!', 'warning');
                return;
            }
            if (confirm('Bạn có chắc chắn muốn gửi đề nghị HÒA đến đối thủ?')) {
                socket.emit('offerDraw', {
                    roomCode,
                    userId: currentUser.id,
                    username: currentUser.username
                });
                showToast('Đã gửi đề nghị hòa cờ', 'info');
            }
        });
    }

    // Đầu hàng
    const resignBtn = document.getElementById('resign-btn');
    if (resignBtn) {
        resignBtn.addEventListener('click', () => {
            if (isGameOver) return;
            if (!socket || !socket.connected) {
                showToast('Chưa kết nối tới máy chủ thời gian thực!', 'warning');
                return;
            }
            if (confirm('Bạn có chắc chắn muốn ĐẦU HÀNG ván cờ này không?')) {
                socket.emit('resign', {
                    roomCode,
                    userId: currentUser.id
                });
            }
        });
    }

    // Gửi tin nhắn chat
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const text = input ? input.value.trim() : '';
            if (!text) return;

            if (!socket || !socket.connected) {
                showToast('Chưa kết nối máy chủ chat!', 'warning');
                return;
            }

            socket.emit('chatMessage', {
                roomCode,
                userId: currentUser.id,
                username: currentUser.username,
                message: text
            });
            input.value = '';
        });
    }

    // Video Call Buttons
    const startCallBtn = document.getElementById('start-call-btn');
    if (startCallBtn) startCallBtn.addEventListener('click', startVideoCall);
    const toggleMicBtn = document.getElementById('toggle-mic-btn');
    if (toggleMicBtn) toggleMicBtn.addEventListener('click', toggleMic);
    const toggleCamBtn = document.getElementById('toggle-cam-btn');
    if (toggleCamBtn) toggleCamBtn.addEventListener('click', toggleCam);
    const endCallBtn = document.getElementById('end-call-btn');
    if (endCallBtn) endCallBtn.addEventListener('click', () => endVideoCall(true));

    // Nút Bắt đầu trận đấu (Chủ phòng)
    const btnHostStart = document.getElementById('btn-host-start');
    if (btnHostStart) {
        btnHostStart.addEventListener('click', () => {
            if (!isHost) {
                showToast('Chỉ chủ phòng mới có thể bắt đầu trận đấu!', 'error');
                return;
            }
            if (!opponentReady) {
                showToast('Vui lòng đợi đối thủ bấm "Sẵn sàng" trước khi bắt đầu!', 'warning');
                return;
            }
            if (socket && socket.connected) {
                socket.emit('startGame', { roomCode });
            }
        });
    }

    // Nút Kick đối thủ (Chủ phòng)
    const btnHostKick = document.getElementById('btn-host-kick');
    if (btnHostKick) {
        btnHostKick.addEventListener('click', () => {
            if (!isHost) {
                showToast('Chỉ chủ phòng mới có quyền kick đối thủ!', 'error');
                return;
            }
            const oppName = document.getElementById('opponent-name')?.textContent || 'đối thủ';
            if (confirm(`Bạn có chắc chắn muốn kick ${oppName} ra khỏi phòng không?`)) {
                if (socket && socket.connected) {
                    socket.emit('kickOpponent', { roomCode });
                }
            }
        });
    }

    // Nút Sẵn sàng (Đối thủ)
    const btnOpponentReady = document.getElementById('btn-opponent-ready');
    if (btnOpponentReady) {
        btnOpponentReady.addEventListener('click', () => {
            if (socket && socket.connected) {
                socket.emit('toggleReady', { roomCode });
            }
        });
    }

    // Nút Yêu cầu đánh lại (Rematch) trong modal GameOver
    const btnRematchAction = document.getElementById('btn-rematch-action');
    if (btnRematchAction) {
        btnRematchAction.addEventListener('click', () => {
            if (!socket || !socket.connected) {
                showToast('Chưa kết nối máy chủ!', 'error');
                return;
            }
            btnRematchAction.disabled = true;
            btnRematchAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gửi yêu cầu...';
            socket.emit('requestRematch', { roomCode });
            showToast('Đã gửi lời mời đánh lại tới đối thủ. Vui lòng chờ phản hồi...', 'info');
        });
    }

    // Nút Thoát phòng trong modal GameOver
    const btnLeaveGameOver = document.getElementById('btn-leave-room-gameover');
    if (btnLeaveGameOver) {
        btnLeaveGameOver.addEventListener('click', () => {
            if (socket && socket.connected) {
                socket.emit('leaveRoom', { roomCode, userId: currentUser.id });
            }
            window.location.href = '/pages/rooms.html';
        });
    }

    // Nút Chấp nhận đánh lại trong modal Rematch
    const btnAcceptRematch = document.getElementById('btn-confirm-accept-rematch');
    if (btnAcceptRematch) {
        btnAcceptRematch.addEventListener('click', () => {
            const modal = document.getElementById('rematch-request-modal');
            if (modal) modal.classList.remove('active');
            if (socket && socket.connected) {
                socket.emit('acceptRematch', { roomCode });
            }
        });
    }

    // Nút Từ chối đánh lại trong modal Rematch
    const btnDeclineRematch = document.getElementById('btn-confirm-decline-rematch');
    if (btnDeclineRematch) {
        btnDeclineRematch.addEventListener('click', () => {
            const modal = document.getElementById('rematch-request-modal');
            if (modal) modal.classList.remove('active');
            if (socket && socket.connected) {
                socket.emit('declineRematch', { roomCode });
            }
        });
    }

    // Thoát phòng trên navbar
    const leaveBtn = document.getElementById('leave-room-btn');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            if (!isGameOver && isGameStarted) {
                const oppName = document.getElementById('opponent-name')?.textContent || '';
                const hasOpponent = oppName && !oppName.includes('Đang chờ đối thủ');

                if (hasOpponent) {
                    if (!confirm('Ván cờ đang diễn ra! Nếu bạn rời phòng bây giờ, bạn sẽ bị XỬ THUA và đối thủ sẽ giành CHIẾN THẮNG. Bạn có chắc chắn muốn rời phòng không?')) {
                        return;
                    }
                    if (socket && socket.connected) {
                        socket.emit('leaveRoom', { roomCode, userId: currentUser.id });
                    }
                } else {
                    if (!confirm('Bạn có chắc chắn muốn rời phòng không?')) return;
                    if (socket && socket.connected) {
                        socket.emit('leaveRoom', { roomCode, userId: currentUser.id });
                    }
                }
            } else {
                if (!confirm('Bạn có chắc chắn muốn rời phòng không?')) return;
                if (socket && socket.connected) {
                    socket.emit('leaveRoom', { roomCode, userId: currentUser.id });
                }
            }
            window.location.href = '/pages/rooms.html';
        });
    }

    // Gắn sự kiện các nút Replay
    const btnFirst = document.getElementById('replay-first-btn');
    if (btnFirst) btnFirst.addEventListener('click', () => { replayMoveIndex = 0; updateReplayView(); });
    const btnJumpB10 = document.getElementById('replay-jump-back-10');
    if (btnJumpB10) btnJumpB10.addEventListener('click', () => jumpGameReplayMoves(-10));
    const btnJumpB5 = document.getElementById('replay-jump-back-5');
    if (btnJumpB5) btnJumpB5.addEventListener('click', () => jumpGameReplayMoves(-5));
    const btnPrev = document.getElementById('replay-prev-btn');
    if (btnPrev) btnPrev.addEventListener('click', () => jumpGameReplayMoves(-1));
    const btnNext = document.getElementById('replay-next-btn');
    if (btnNext) btnNext.addEventListener('click', () => jumpGameReplayMoves(1));
    const btnJumpF5 = document.getElementById('replay-jump-fwd-5');
    if (btnJumpF5) btnJumpF5.addEventListener('click', () => jumpGameReplayMoves(5));
    const btnJumpF10 = document.getElementById('replay-jump-fwd-10');
    if (btnJumpF10) btnJumpF10.addEventListener('click', () => jumpGameReplayMoves(10));
    const btnLast = document.getElementById('replay-last-btn');
    if (btnLast) btnLast.addEventListener('click', () => { replayMoveIndex = replayHistory.length; updateReplayView(); });
    const btnPlay = document.getElementById('replay-play-btn');
    if (btnPlay) btnPlay.addEventListener('click', toggleReplayAutoPlay);
    const btnExit = document.getElementById('replay-exit-btn');
    if (btnExit) btnExit.addEventListener('click', exitReplayMode);

    // Thanh tua slider
    const gameSlider = document.getElementById('game-replay-timeline-slider');
    if (gameSlider) {
        gameSlider.addEventListener('input', (e) => {
            replayMoveIndex = parseInt(e.target.value, 10) || 0;
            updateReplayView();
        });
    }

    // Nút tốc độ
    document.querySelectorAll('.game-speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sp = parseFloat(btn.dataset.speed) || 1.0;
            setGameReplaySpeed(sp);
        });
    });

    // Hỗ trợ phím bàn phím khi đang Replay
    window.addEventListener('keydown', (e) => {
        if (!isReplayMode) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            jumpGameReplayMoves(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            jumpGameReplayMoves(1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            jumpGameReplayMoves(-5);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            jumpGameReplayMoves(5);
        } else if (e.key === 'Home') {
            e.preventDefault();
            replayMoveIndex = 0;
            updateReplayView();
        } else if (e.key === 'End') {
            e.preventDefault();
            replayMoveIndex = replayHistory.length;
            updateReplayView();
        } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            toggleReplayAutoPlay();
        } else if (e.key === 'Escape') {
            exitReplayMode();
        }
    });
}

// ================= LOGIC XEM LẠI VÁN CỜ (REPLAY MODE) =================
let isReplayMode = false;
let replayChess = null;
let replayHistory = [];
let replayMoveIndex = 0;
let replayAutoInterval = null;
let gameReplaySpeedMultiplier = 1.0;
const GAME_REPLAY_SPEEDS = {
    0.5: 1800,
    1.0: 900,
    1.5: 600,
    2.0: 350
};

function jumpGameReplayMoves(delta) {
    if (!replayHistory || replayHistory.length === 0) return;
    const target = Math.max(0, Math.min(replayHistory.length, replayMoveIndex + delta));
    if (target !== replayMoveIndex) {
        replayMoveIndex = target;
        updateReplayView();
    }
}

function setGameReplaySpeed(speed) {
    gameReplaySpeedMultiplier = speed;
    document.querySelectorAll('.game-speed-btn').forEach(btn => {
        const btnSpeed = parseFloat(btn.dataset.speed);
        if (Math.abs(btnSpeed - speed) < 0.05) {
            btn.style.background = '#81b64c';
            btn.style.color = '#fff';
            btn.classList.add('active');
        } else {
            btn.style.background = 'transparent';
            btn.style.color = '#94a3b8';
            btn.classList.remove('active');
        }
    });

    if (replayAutoInterval) {
        clearInterval(replayAutoInterval);
        const intervalMs = GAME_REPLAY_SPEEDS[gameReplaySpeedMultiplier] || 900;
        replayAutoInterval = setInterval(() => {
            if (replayMoveIndex < replayHistory.length) {
                replayMoveIndex++;
                updateReplayView();
            } else {
                clearInterval(replayAutoInterval);
                replayAutoInterval = null;
                const playBtn = document.getElementById('replay-play-btn');
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
            }
        }, intervalMs);
    }
}

async function startReplayMode() {
    isReplayMode = true;
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.classList.remove('active');

    replayHistory = (currentMatchMoveHistory && currentMatchMoveHistory.length > 0)
        ? [...currentMatchMoveHistory]
        : ((chess && chess.history && chess.history().length > 0) ? chess.history() : []);

    // Nếu danh sách rỗng (ví dụ vừa tải lại trang F5 sau khi ván cờ kết thúc)
    if (!replayHistory || replayHistory.length === 0) {
        if (roomCode) {
            try {
                const res = await fetch(`/api/rooms/${roomCode}`);
                if (res.ok) {
                    const rData = await res.json();
                    const g = rData.game;
                    if (g && g.move_history) {
                        const parsed = typeof g.move_history === 'string' ? JSON.parse(g.move_history) : g.move_history;
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            currentMatchMoveHistory = [...parsed];
                            replayHistory = [...parsed];
                            renderMoveHistory(replayHistory);
                        }
                    }
                }
            } catch (e) {}
        }
    }

    if (!replayHistory || replayHistory.length === 0) {
        showToast('Ván cờ chưa có nước đi nào để xem lại!', 'info');
        isReplayMode = false;
        return;
    }

    if (!replayChess) replayChess = new Chess();

    const bar = document.getElementById('replay-controls-bar');
    if (bar) bar.style.display = 'flex';

    // Bắt đầu từ đầu ván để người chơi xem tuần tự
    replayMoveIndex = 0;

    const gameSlider = document.getElementById('game-replay-timeline-slider');
    const currLabel = document.getElementById('game-replay-slider-curr');
    const maxLabel = document.getElementById('game-replay-slider-max');
    if (gameSlider) {
        gameSlider.max = replayHistory.length;
        gameSlider.value = 0;
    }
    if (currLabel) currLabel.textContent = '0';
    if (maxLabel) maxLabel.textContent = replayHistory.length.toString();

    updateReplayView();
    showToast('Đã bật chế độ xem lại ván cờ. Dùng phím ← / → để tua nước cờ, Space để phát!', 'info');
}

// Chế độ mở xem lại trực tiếp một ván cờ qua URL (?replay=123 hoặc ?gameId=123)
async function initDirectReplayView(gameId) {
    try {
        console.log(`[DirectReplay] Đang nạp ván cờ #${gameId}...`);
        const res = await fetch(`/api/games/${gameId}`);
        if (!res.ok) {
            showToast('Không tìm thấy ván cờ để xem lại!', 'error');
            setTimeout(() => window.location.href = '/pages/rooms.html', 1500);
            return;
        }
        const game = await res.json();

        // 1. Cập nhật mã phòng & tên kỳ thủ
        const codeDisplay = document.getElementById('display-room-code');
        if (codeDisplay) codeDisplay.textContent = game.room_code || `GAME_${game.id}`;

        const whiteName = game.white_player_name || 'Quân Trắng';
        const blackName = game.black_player_name || 'Quân Đen';
        updatePlayerLabels(whiteName, blackName);

        // 2. Ẩn thanh staging và hiển thị nhãn replay
        const stagingBar = document.getElementById('room-staging-bar');
        if (stagingBar) stagingBar.style.display = 'none';
        const turnBadge = document.getElementById('turn-status-badge');
        if (turnBadge) {
            turnBadge.textContent = `REPLAY VÁN #${game.id}`;
            turnBadge.className = 'badge badge-win';
        }

        // 3. Khởi tạo chess & chessboard UI
        if (typeof Chess !== 'undefined') chess = new Chess();
        if (typeof ChessboardUI !== 'undefined') {
            const mount = document.getElementById('chessboard-mount');
            if (mount) {
                board = new ChessboardUI('#chessboard-mount', {
                    orientation: 'white',
                    draggable: false,
                    clickable: false,
                    showEvalBar: true
                });
            }
        }

        // 4. Nạp move history
        let moves = [];
        if (Array.isArray(game.move_history)) moves = game.move_history;
        else if (typeof game.move_history === 'string') {
            try { moves = JSON.parse(game.move_history); } catch (e) { moves = []; }
        }

        currentMatchMoveHistory = moves;
        renderMoveHistory(moves);

        attachUIEvents();

        // 5. Mở chế độ xem lại
        await startReplayMode();
    } catch (err) {
        console.error('[DirectReplay Error]:', err);
        showToast('Lỗi khi tải ván cờ xem lại', 'error');
    }
}

function exitReplayMode() {
    isReplayMode = false;
    if (replayAutoInterval) {
        clearInterval(replayAutoInterval);
        replayAutoInterval = null;
        const playBtn = document.getElementById('replay-play-btn');
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
    }

    const bar = document.getElementById('replay-controls-bar');
    if (bar) bar.style.display = 'none';

    // Trả lại bàn cờ về thế cờ kết thúc ván
    if (board && chess) {
        board.setPosition(chess.fen());
        board.clearHighlights();
    }
    showToast('Đã thoát chế độ xem lại ván cờ', 'info');
}

function updateReplayView() {
    if (!replayChess || !board) return;
    replayChess.reset();
    let lastMove = null;

    for (let i = 0; i < replayMoveIndex; i++) {
        try {
            lastMove = replayChess.move(replayHistory[i]);
        } catch (e) {}
    }

    board.setPosition(replayChess.fen());

    if (lastMove) {
        board.setLastMove(lastMove.from, lastMove.to);
        if (typeof ChessAudio !== 'undefined' && ChessAudio.playMove) {
            ChessAudio.playMove();
        }
    } else {
        if (typeof board.clearHighlights === 'function') {
            board.clearHighlights();
        } else {
            if (board.clearSelection) board.clearSelection();
            if (board.clearCheck) board.clearCheck();
        }
    }

    const statusEl = document.getElementById('replay-status-text');
    if (statusEl) {
        if (replayMoveIndex === 0) {
            statusEl.textContent = 'Trạng thái ban đầu';
        } else {
            const moveNum = Math.ceil(replayMoveIndex / 2);
            const isWhite = (replayMoveIndex % 2 !== 0);
            const san = replayHistory[replayMoveIndex - 1];
            statusEl.textContent = `Nước ${moveNum}: ${isWhite ? 'Trắng' : 'Đen'} ${san} (${replayMoveIndex}/${replayHistory.length})`;
        }
    }

    // Cập nhật Slider và Label
    const gameSlider = document.getElementById('game-replay-timeline-slider');
    const currLabel = document.getElementById('game-replay-slider-curr');
    const maxLabel = document.getElementById('game-replay-slider-max');
    if (gameSlider) {
        gameSlider.value = replayMoveIndex;
        gameSlider.max = replayHistory.length;
    }
    if (currLabel) currLabel.textContent = replayMoveIndex.toString();
    if (maxLabel) maxLabel.textContent = replayHistory.length.toString();

    // Highlight nước đi trong bảng moves-table nếu có
    const rows = document.querySelectorAll('#moves-table-body tr');
    rows.forEach(r => r.classList.remove('active-replay-row'));
    if (replayMoveIndex > 0) {
        const rowIndex = Math.floor((replayMoveIndex - 1) / 2);
        if (rows[rowIndex]) {
            rows[rowIndex].classList.add('active-replay-row');
            rows[rowIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }
}

function toggleReplayAutoPlay() {
    const playBtn = document.getElementById('replay-play-btn');
    if (replayAutoInterval) {
        clearInterval(replayAutoInterval);
        replayAutoInterval = null;
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
    } else {
        if (replayMoveIndex >= replayHistory.length) {
            replayMoveIndex = 0;
            updateReplayView();
        }
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i> Dừng';
        const intervalMs = GAME_REPLAY_SPEEDS[gameReplaySpeedMultiplier] || 900;
        replayAutoInterval = setInterval(() => {
            if (replayMoveIndex < replayHistory.length) {
                replayMoveIndex++;
                updateReplayView();
            } else {
                clearInterval(replayAutoInterval);
                replayAutoInterval = null;
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
            }
        }, intervalMs);
    }
}

