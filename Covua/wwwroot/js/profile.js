// ============================================================
// Logic Hồ Sơ Cá Nhân & Lịch Sử Trận Đấu
// ============================================================

let currentUser = null;
let reviewGameData = null;
let reviewChess = null;
let reviewBoard = null;
let reviewMoveIndex = 0;
let reviewHistoryList = [];
let autoPlayInterval = null;
const loadedGamesCache = {};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Kiểm tra đăng nhập
    if (!Auth.isLoggedIn()) {
        showToast('Vui lòng đăng nhập để xem hồ sơ', 'error');
        setTimeout(() => window.location.href = '/pages/login.html', 1000);
        return;
    }
    currentUser = Auth.getUser();

    // 2. Nạp dữ liệu hồ sơ, thống kê và lịch sử đấu
    renderUserInfo();
    await loadStats();
    await loadHistory();

    // 3. Khởi tạo modal và bàn cờ xem lại trận đấu (modal review)
    ensureReviewModal();

    // 4. Gắn sự kiện sửa tên hiển thị
    const updateProfileForm = document.getElementById('update-profile-form');
    if (updateProfileForm) {
        updateProfileForm.addEventListener('submit', handleUpdateUsername);
    }
});

function renderUserInfo() {
    document.getElementById('profile-username').textContent = currentUser.username;
    document.getElementById('profile-email').textContent = currentUser.email;
    const input = document.getElementById('new-username-input');
    if (input) input.value = currentUser.username;
}

// Lấy thống kê thắng/thua/hòa
async function loadStats() {
    try {
        const res = await Auth.fetchWithAuth(`/api/games/stats/${currentUser.id}`);
        if (!res.ok) return;
        const stats = await res.json();

        const total = Number(stats.total_games || 0);
        const wins = Number(stats.wins || 0);
        const losses = Number(stats.losses || 0);
        const draws = Number(stats.draws || 0);

        const elTotal = document.getElementById('stat-total');
        const elWins = document.getElementById('stat-wins');
        const elLosses = document.getElementById('stat-losses');
        const elDraws = document.getElementById('stat-draws');
        if (elTotal) elTotal.textContent = total;
        if (elWins) elWins.textContent = wins;
        if (elLosses) elLosses.textContent = losses;
        if (elDraws) elDraws.textContent = draws;

        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const elWinrate = document.getElementById('stat-winrate');
        if (elWinrate) elWinrate.textContent = `${winRate}%`;

        const elBar = document.getElementById('stat-winrate-bar');
        if (elBar) elBar.style.width = `${winRate}%`;
    } catch (e) {
        console.error('Lỗi tải thống kê:', e);
    }
}

// Lấy lịch sử các trận đấu
async function loadHistory() {
    const tbody = document.getElementById('history-table-body');
    const countBadge = document.getElementById('history-total-badge');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Đang tải dữ liệu trận đấu...</td></tr>';

    try {
        const res = await Auth.fetchWithAuth(`/api/games/history/${currentUser.id}`);
        if (!res.ok) return;
        const games = await res.json();

        if (!games || games.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 35px 20px; color: var(--text-muted);"><i class="fas fa-chess-board" style="font-size: 2.2rem; display: block; margin-bottom: 12px; color: var(--text-dim);"></i>Bạn chưa thi đấu trận nào. Hãy tham gia hoặc tạo phòng chơi ngay!</td></tr>';
            if (countBadge) countBadge.textContent = '0 trận';
            return;
        }

        if (countBadge) countBadge.textContent = `${games.length} trận đấu`;

        tbody.innerHTML = '';
        games.forEach((g) => {
            loadedGamesCache[g.id] = g;
            const isWhite = Number(g.white_player_id) === Number(currentUser.id);
            const opponentName = isWhite ? (g.black_player_name || g.black_username || 'Đang chờ') : (g.white_player_name || g.white_username || 'Khách');

            // Kết quả
            let badgeClass = 'draw';
            let resultText = 'Hòa';
            let resultIcon = '<i class="fas fa-handshake"></i>';

            if (g.status === 'playing') {
                badgeClass = 'draw';
                resultText = 'Đang chơi';
                resultIcon = '<i class="fas fa-spinner fa-spin"></i>';
            } else if (g.result === 'draw') {
                badgeClass = 'draw';
                resultText = 'Hòa';
                resultIcon = '<i class="fas fa-handshake"></i>';
            } else if ((isWhite && g.result === 'white_win') || (!isWhite && g.result === 'black_win')) {
                badgeClass = 'win';
                resultText = 'Thắng';
                resultIcon = '<i class="fas fa-trophy"></i>';
            } else {
                badgeClass = 'loss';
                resultText = 'Thua';
                resultIcon = '<i class="fas fa-times-circle"></i>';
            }

            const movesList = JSON.parse(g.move_history || '[]');
            const dateStr = g.started_at ? new Date(g.started_at).toLocaleDateString('vi-VN') : 'Mới đây';
            const pieceHtml = isWhite 
                ? '<span class="piece-tag white">♔ Quân Trắng</span>' 
                : '<span class="piece-tag black">♚ Quân Đen</span>';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="game-id-badge">#${g.id}</span></td>
                <td><strong style="color: #fff; font-size: 0.95rem;">${escapeHtml(opponentName)}</strong></td>
                <td>${pieceHtml}</td>
                <td><span class="result-badge ${badgeClass}">${resultIcon} ${resultText}</span></td>
                <td><span style="font-family: 'JetBrains Mono', monospace; font-weight: 600;">${movesList.length} nước</span></td>
                <td style="color: var(--text-dim); font-size: 0.85rem;">${dateStr}</td>
                <td style="text-align: right;">
                    <button class="btn-review" onclick="openReviewModal(${g.id})">
                        <i class="fas fa-play"></i> Xem lại
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--accent-danger); padding: 20px;">Lỗi tải lịch sử trận đấu</td></tr>';
    }
}

// Cập nhật tên hiển thị
async function handleUpdateUsername(e) {
    e.preventDefault();
    const input = document.getElementById('new-username-input');
    const newName = input.value.trim();
    if (!newName || newName.length < 3) {
        showToast('Tên hiển thị phải có ít nhất 3 ký tự', 'error');
        return;
    }

    try {
        const res = await Auth.fetchWithAuth('/api/auth/update', {
            method: 'PUT',
            body: JSON.stringify({ username: newName })
        });
        const data = await res.json();

        if (res.ok) {
            currentUser.username = data.username;
            Auth.setUser(currentUser);
            renderUserInfo();
            updateNav();
            showToast('Cập nhật tên thành công!', 'success');
        } else {
            showToast(data.message || 'Cập nhật thất bại', 'error');
        }
    } catch (err) {
        showToast('Lỗi máy chủ khi cập nhật', 'error');
    }
}

// ================= MODAL XEM LẠI TRẬN ĐẤU (GAME REVIEW REPLAY) =================
let reviewControlsInitialized = false;
let reviewSpeedMultiplier = 1.0;
const REVIEW_SPEEDS = {
    0.5: 1800,
    1.0: 900,
    1.5: 600,
    2.0: 350
};

function ensureReviewModal() {
    let modal = document.getElementById('review-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'review-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal" style="max-width: 860px; width: 95%;">
                <div class="modal-header">
                    <h3><i class="fas fa-chess-board" style="color: var(--primary, #81b64c);"></i> Phân Tích & Xem Lại Ván Cờ (Replay)</h3>
                    <button class="modal-close" id="review-close-btn">&times;</button>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input, #0e1218); padding: 10px 16px; border-radius: var(--radius-sm, 8px); margin-bottom: 14px; font-size: 0.95rem; border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); flex-wrap: wrap; gap: 8px;">
                    <div><span style="color: var(--text-dim, #64748b);">Trắng:</span> <strong id="review-white-name" style="color: #fff;">-</strong></div>
                    <div style="font-size: 0.85rem; color: var(--text-muted);"><i class="fas fa-keyboard"></i> Phím ← / → tua 1 nước, ↑ / ↓ tua 5s, Space phát</div>
                    <div><span style="color: var(--text-dim, #64748b);">Đen:</span> <strong id="review-black-name" style="color: #fff;">-</strong></div>
                </div>

                <div class="review-modal-grid" style="display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr); gap: 16px; align-items: start;">
                    <!-- Cột Trái: Bàn cờ xem lại & Thanh điều khiển -->
                    <div>
                        <div id="review-board-mount" style="max-width: 400px; margin: 0 auto 10px;"></div>

                        <div style="text-align: center; margin-bottom: 8px;">
                            <span id="review-move-label" style="font-weight: 700; color: #86efac; font-size: 0.95rem; font-family: 'JetBrains Mono', monospace;">Trạng thái ban đầu</span>
                        </div>

                        <!-- Thanh tua trực quan (Timeline Slider) -->
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; background: rgba(255,255,255,0.04); padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
                            <span id="review-slider-current" style="font-size: 0.8rem; font-weight: 700; color: #38bdf8; font-family: monospace; min-width: 25px;">0</span>
                            <input type="range" id="review-timeline-slider" min="0" max="0" value="0" style="flex: 1; accent-color: #81b64c; cursor: pointer; height: 6px;">
                            <span id="review-slider-max" style="font-size: 0.8rem; font-weight: 700; color: #94a3b8; font-family: monospace; min-width: 25px; text-align: right;">0</span>
                        </div>

                        <!-- Bảng nút tua & điều khiển -->
                        <div style="display: flex; flex-direction: column; gap: 8px; align-items: center;">
                            <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
                                <button class="btn btn-secondary btn-sm" id="review-first-btn" title="Về đầu ván (Home)"><i class="fas fa-step-backward"></i></button>
                                <button class="btn btn-secondary btn-sm" id="review-jump-back-10" title="Tua lùi 10 nước (-10s)" style="font-weight: 800; font-size: 0.78rem; padding: 4px 8px;">-10s</button>
                                <button class="btn btn-secondary btn-sm" id="review-jump-back-5" title="Tua lùi 5 nước (-5s)" style="font-weight: 800; font-size: 0.78rem; padding: 4px 8px;">-5s</button>
                                <button class="btn btn-secondary btn-sm" id="review-prev-btn" title="Nước trước (←)"><i class="fas fa-chevron-left"></i></button>
                                <button class="btn btn-primary btn-sm" id="review-play-btn" style="min-width: 85px;" title="Tự động phát (Space)"><i class="fas fa-play"></i> Phát</button>
                                <button class="btn btn-secondary btn-sm" id="review-next-btn" title="Nước kế (→)"><i class="fas fa-chevron-right"></i></button>
                                <button class="btn btn-secondary btn-sm" id="review-jump-fwd-5" title="Tua tới 5 nước (+5s)" style="font-weight: 800; font-size: 0.78rem; padding: 4px 8px;">+5s</button>
                                <button class="btn btn-secondary btn-sm" id="review-jump-fwd-10" title="Tua tới 10 nước (+10s)" style="font-weight: 800; font-size: 0.78rem; padding: 4px 8px;">+10s</button>
                                <button class="btn btn-secondary btn-sm" id="review-last-btn" title="Đến cuối ván (End)"><i class="fas fa-step-forward"></i></button>
                            </div>

                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 0.8rem; color: #94a3b8; font-weight: 700;"><i class="fas fa-tachometer-alt"></i> Tốc độ:</span>
                                <div class="review-speed-selector" style="display: inline-flex; background: rgba(0,0,0,0.3); border-radius: 6px; padding: 2px; border: 1px solid rgba(255,255,255,0.08); gap: 2px;">
                                    <button type="button" class="review-speed-btn" data-speed="0.5" style="padding: 3px 9px; font-size: 0.78rem; border-radius: 4px; border: none; background: transparent; color: #94a3b8; cursor: pointer; font-weight: 700;">0.5x</button>
                                    <button type="button" class="review-speed-btn active" data-speed="1.0" style="padding: 3px 9px; font-size: 0.78rem; border-radius: 4px; border: none; background: #81b64c; color: #fff; cursor: pointer; font-weight: 700;">1x</button>
                                    <button type="button" class="review-speed-btn" data-speed="1.5" style="padding: 3px 9px; font-size: 0.78rem; border-radius: 4px; border: none; background: transparent; color: #94a3b8; cursor: pointer; font-weight: 700;">1.5x</button>
                                    <button type="button" class="review-speed-btn" data-speed="2.0" style="padding: 3px 9px; font-size: 0.78rem; border-radius: 4px; border: none; background: transparent; color: #94a3b8; cursor: pointer; font-weight: 700;">2x</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Cột Phải: Bảng danh sách tất cả các nước đi -->
                    <div style="background: var(--bg-input, #0e1218); border: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); border-radius: var(--radius-sm, 8px); padding: 12px; height: 440px; display: flex; flex-direction: column;">
                        <div style="font-weight: 700; color: #fff; font-size: 0.9rem; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--border-subtle, rgba(255,255,255,0.08)); display: flex; justify-content: space-between;">
                            <span><i class="fas fa-list-ol"></i> Tiến trình ván đấu</span>
                            <span style="font-size: 0.8rem; color: var(--text-dim);" id="review-moves-count">0 nước</span>
                        </div>
                        <div id="review-moves-container" style="overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 4px;">
                            <!-- Nạp danh sách nước đi -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    if (!reviewControlsInitialized) {
        initReviewControls();
        reviewControlsInitialized = true;
    }

    if (!reviewChess && typeof Chess !== 'undefined') {
        reviewChess = new Chess();
    }
    if (!reviewBoard && typeof ChessboardUI !== 'undefined') {
        const mount = document.getElementById('review-board-mount');
        if (mount) {
            reviewBoard = new ChessboardUI('#review-board-mount', {
                draggable: false,
                clickable: false
            });
        }
    }

    return modal;
}

function jumpReviewMoves(delta) {
    if (!reviewHistoryList || reviewHistoryList.length === 0) return;
    const target = Math.max(0, Math.min(reviewHistoryList.length, reviewMoveIndex + delta));
    if (target !== reviewMoveIndex) {
        reviewMoveIndex = target;
        rebuildBoardToMoveIndex();
    }
}

function setReviewSpeed(speed) {
    reviewSpeedMultiplier = speed;
    document.querySelectorAll('.review-speed-btn').forEach(btn => {
        const btnSpeed = parseFloat(btn.dataset.speed);
        if (Math.abs(btnSpeed - speed) < 0.05) {
            btn.style.background = 'var(--primary, #81b64c)';
            btn.style.color = '#fff';
            btn.classList.add('active');
        } else {
            btn.style.background = 'transparent';
            btn.style.color = '#94a3b8';
            btn.classList.remove('active');
        }
    });

    if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        const intervalMs = REVIEW_SPEEDS[reviewSpeedMultiplier] || 900;
        autoPlayInterval = setInterval(() => {
            if (reviewMoveIndex < reviewHistoryList.length) {
                reviewMoveIndex++;
                rebuildBoardToMoveIndex();
            } else {
                clearInterval(autoPlayInterval);
                autoPlayInterval = null;
                const playBtn = document.getElementById('review-play-btn');
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
            }
        }, intervalMs);
    }
}

async function openReviewModal(gameId) {
    try {
        const modal = ensureReviewModal();
        let gameData = null;

        // 1. Thử lấy từ REST API
        try {
            const res = await fetch(`/api/games/${gameId}`);
            if (res.ok) {
                gameData = await res.json();
            }
        } catch (fetchErr) {
            console.warn('[Review] API get game failed, fallback to cache:', fetchErr);
        }

        // 2. Dự phòng lấy từ cache lịch sử đấu
        if (!gameData && loadedGamesCache[gameId]) {
            gameData = loadedGamesCache[gameId];
        }

        if (!gameData) {
            showToast('Không thể tải chi tiết ván đấu', 'error');
            return;
        }

        reviewGameData = gameData;
        const rawHistory = gameData.move_history;
        if (Array.isArray(rawHistory)) {
            reviewHistoryList = rawHistory;
        } else if (typeof rawHistory === 'string') {
            try {
                reviewHistoryList = JSON.parse(rawHistory);
            } catch (e) {
                reviewHistoryList = [];
            }
        } else {
            reviewHistoryList = [];
        }
        reviewMoveIndex = 0;

        // Cập nhật tiêu đề ván đấu
        const whiteNameEl = document.getElementById('review-white-name');
        const blackNameEl = document.getElementById('review-black-name');
        if (whiteNameEl) whiteNameEl.textContent = reviewGameData.white_player_name || 'Quân Trắng';
        if (blackNameEl) blackNameEl.textContent = reviewGameData.black_player_name || 'Quân Đen';

        // Đặt lại bàn cờ về ban đầu và điều chỉnh góc nhìn theo vai trò
        if (reviewChess && reviewBoard) {
            const isUserBlack = (currentUser && Number(currentUser.id) === Number(reviewGameData.black_player_id));
            reviewBoard.setOrientation(isUserBlack ? 'black' : 'white');
            reviewChess.reset();
            reviewBoard.setPosition(reviewChess.fen());
            if (typeof reviewBoard.clearHighlights === 'function') {
                reviewBoard.clearHighlights();
            } else {
                if (reviewBoard.clearSelection) reviewBoard.clearSelection();
                if (reviewBoard.clearCheck) reviewBoard.clearCheck();
            }
        }

        // Khởi tạo slider
        const slider = document.getElementById('review-timeline-slider');
        const curLabel = document.getElementById('review-slider-current');
        const maxLabel = document.getElementById('review-slider-max');
        if (slider) {
            slider.max = reviewHistoryList.length;
            slider.value = 0;
        }
        if (curLabel) curLabel.textContent = '0';
        if (maxLabel) maxLabel.textContent = reviewHistoryList.length.toString();

        updateReviewMoveText();
        renderReviewMoveList();

        if (modal) {
            modal.classList.add('active');
        }
    } catch (err) {
        console.error('[Review Modal Error]:', err);
        showToast('Lỗi khi mở ván đấu', 'error');
    }
}

function renderReviewMoveList() {
    const container = document.getElementById('review-moves-container');
    const countEl = document.getElementById('review-moves-count');
    if (!container) return;
    container.innerHTML = '';
    if (countEl) countEl.textContent = `${reviewHistoryList.length} nước`;

    for (let i = 0; i < reviewHistoryList.length; i += 2) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9rem;';
        
        const moveNum = Math.floor(i / 2) + 1;
        const numEl = document.createElement('span');
        numEl.style.cssText = 'width: 28px; color: var(--text-dim, #64748b); font-weight: 700;';
        numEl.textContent = `${moveNum}.`;

        const whiteMove = reviewHistoryList[i] || '';
        const whiteBtn = document.createElement('span');
        whiteBtn.className = 'review-move-cell';
        whiteBtn.dataset.step = (i + 1).toString();
        whiteBtn.style.cssText = 'flex: 1; padding: 4px 8px; border-radius: 4px; cursor: pointer; color: #fff; background: rgba(255,255,255,0.04); text-align: center; font-weight: 600;';
        whiteBtn.textContent = whiteMove;
        whiteBtn.onclick = () => {
            reviewMoveIndex = i + 1;
            rebuildBoardToMoveIndex();
        };

        const blackMove = reviewHistoryList[i + 1] || '';
        const blackBtn = document.createElement('span');
        blackBtn.className = 'review-move-cell';
        if (blackMove) {
            blackBtn.dataset.step = (i + 2).toString();
            blackBtn.style.cssText = 'flex: 1; padding: 4px 8px; border-radius: 4px; cursor: pointer; color: #cbd5e1; background: rgba(255,255,255,0.04); text-align: center; font-weight: 600;';
            blackBtn.textContent = blackMove;
            blackBtn.onclick = () => {
                reviewMoveIndex = i + 2;
                rebuildBoardToMoveIndex();
            };
        } else {
            blackBtn.style.cssText = 'flex: 1;';
        }

        row.appendChild(numEl);
        row.appendChild(whiteBtn);
        row.appendChild(blackBtn);
        container.appendChild(row);
    }
}

function initReviewControls() {
    // Đóng Modal
    const closeBtn = document.getElementById('review-close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => {
            if (autoPlayInterval) {
                clearInterval(autoPlayInterval);
                autoPlayInterval = null;
            }
            const modal = document.getElementById('review-modal');
            if (modal) modal.classList.remove('active');
        };
    }

    // Đầu ván (Home / Start)
    const firstBtn = document.getElementById('review-first-btn');
    if (firstBtn) {
        firstBtn.onclick = () => {
            reviewMoveIndex = 0;
            rebuildBoardToMoveIndex();
        };
    }

    // Tua lùi 10 nước (-10s)
    const jumpBack10 = document.getElementById('review-jump-back-10');
    if (jumpBack10) {
        jumpBack10.onclick = () => jumpReviewMoves(-10);
    }

    // Tua lùi 5 nước (-5s)
    const jumpBack5 = document.getElementById('review-jump-back-5');
    if (jumpBack5) {
        jumpBack5.onclick = () => jumpReviewMoves(-5);
    }

    // Nước trước (Prev - 1 nước)
    const prevBtn = document.getElementById('review-prev-btn');
    if (prevBtn) {
        prevBtn.onclick = () => jumpReviewMoves(-1);
    }

    // Nước kế (Next + 1 nước)
    const nextBtn = document.getElementById('review-next-btn');
    if (nextBtn) {
        nextBtn.onclick = () => jumpReviewMoves(1);
    }

    // Tua tới 5 nước (+5s)
    const jumpFwd5 = document.getElementById('review-jump-fwd-5');
    if (jumpFwd5) {
        jumpFwd5.onclick = () => jumpReviewMoves(5);
    }

    // Tua tới 10 nước (+10s)
    const jumpFwd10 = document.getElementById('review-jump-fwd-10');
    if (jumpFwd10) {
        jumpFwd10.onclick = () => jumpReviewMoves(10);
    }

    // Cuối ván (End / Last)
    const lastBtn = document.getElementById('review-last-btn');
    if (lastBtn) {
        lastBtn.onclick = () => {
            reviewMoveIndex = reviewHistoryList.length;
            rebuildBoardToMoveIndex();
        };
    }

    // Tự động phát (Auto Play)
    const playBtn = document.getElementById('review-play-btn');
    if (playBtn) {
        playBtn.onclick = () => {
            if (autoPlayInterval) {
                clearInterval(autoPlayInterval);
                autoPlayInterval = null;
                playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
            } else {
                if (reviewMoveIndex >= reviewHistoryList.length) {
                    reviewMoveIndex = 0;
                    rebuildBoardToMoveIndex();
                }
                playBtn.innerHTML = '<i class="fas fa-pause"></i> Dừng';
                const intervalMs = REVIEW_SPEEDS[reviewSpeedMultiplier] || 900;
                autoPlayInterval = setInterval(() => {
                    if (reviewMoveIndex < reviewHistoryList.length) {
                        reviewMoveIndex++;
                        rebuildBoardToMoveIndex();
                    } else {
                        clearInterval(autoPlayInterval);
                        autoPlayInterval = null;
                        playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
                    }
                }, intervalMs);
            }
        };
    }

    // Thanh trượt tua thời gian/nước cờ (Timeline Slider)
    const slider = document.getElementById('review-timeline-slider');
    if (slider) {
        slider.oninput = (e) => {
            reviewMoveIndex = parseInt(e.target.value, 10) || 0;
            rebuildBoardToMoveIndex();
        };
    }

    // Các nút chọn tốc độ Replay
    document.querySelectorAll('.review-speed-btn').forEach(btn => {
        btn.onclick = () => {
            const sp = parseFloat(btn.dataset.speed) || 1.0;
            setReviewSpeed(sp);
        };
    });

    // Lắng nghe phím bàn phím khi modal xem lại đang mở
    window.addEventListener('keydown', (e) => {
        const modal = document.getElementById('review-modal');
        if (!modal || !modal.classList.contains('active')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            jumpReviewMoves(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            jumpReviewMoves(1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            jumpReviewMoves(-5);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            jumpReviewMoves(5);
        } else if (e.key === 'Home') {
            e.preventDefault();
            reviewMoveIndex = 0;
            rebuildBoardToMoveIndex();
        } else if (e.key === 'End') {
            e.preventDefault();
            reviewMoveIndex = reviewHistoryList.length;
            rebuildBoardToMoveIndex();
        } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            const pBtn = document.getElementById('review-play-btn');
            if (pBtn) pBtn.click();
        } else if (e.key === 'Escape') {
            const cBtn = document.getElementById('review-close-btn');
            if (cBtn) cBtn.click();
        }
    });
}

function rebuildBoardToMoveIndex() {
    if (!reviewChess || !reviewBoard) return;
    reviewChess.reset();
    let lastMoveObj = null;

    for (let i = 0; i < reviewMoveIndex; i++) {
        try {
            lastMoveObj = reviewChess.move(reviewHistoryList[i]);
        } catch (e) {
            console.warn('Invalid move in replay:', reviewHistoryList[i]);
        }
    }

    reviewBoard.setPosition(reviewChess.fen());

    if (lastMoveObj) {
        reviewBoard.setLastMove(lastMoveObj.from, lastMoveObj.to);
        if (typeof ChessAudio !== 'undefined' && ChessAudio.playMove) {
            ChessAudio.playMove();
        }
    } else {
        if (typeof reviewBoard.clearHighlights === 'function') {
            reviewBoard.clearHighlights();
        } else {
            if (reviewBoard.clearSelection) reviewBoard.clearSelection();
            if (reviewBoard.clearCheck) reviewBoard.clearCheck();
        }
    }

    // Cập nhật Slider và Label hiển thị
    const slider = document.getElementById('review-timeline-slider');
    const curLabel = document.getElementById('review-slider-current');
    const maxLabel = document.getElementById('review-slider-max');
    if (slider) {
        slider.value = reviewMoveIndex;
        slider.max = reviewHistoryList.length;
    }
    if (curLabel) curLabel.textContent = reviewMoveIndex.toString();
    if (maxLabel) maxLabel.textContent = reviewHistoryList.length.toString();

    updateReviewMoveText();

    // Highlight ô nước cờ đang xem trong danh sách
    document.querySelectorAll('.review-move-cell').forEach(cell => {
        const step = Number(cell.dataset.step);
        if (step === reviewMoveIndex) {
            cell.style.background = 'var(--primary, #81b64c)';
            cell.style.color = '#fff';
            cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            cell.style.background = 'rgba(255,255,255,0.04)';
            cell.style.color = (step % 2 !== 0) ? '#fff' : '#cbd5e1';
        }
    });
}

function updateReviewMoveText() {
    const textEl = document.getElementById('review-move-label');
    if (!textEl) return;
    if (reviewMoveIndex === 0) {
        textEl.textContent = 'Trạng thái ban đầu';
    } else {
        const moveNum = Math.ceil(reviewMoveIndex / 2);
        const isWhite = (reviewMoveIndex % 2 !== 0);
        const san = reviewHistoryList[reviewMoveIndex - 1];
        textEl.textContent = `Nước ${moveNum}: ${isWhite ? 'Trắng' : 'Đen'} đi ${san} (${reviewMoveIndex}/${reviewHistoryList.length})`;
    }
}

function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

