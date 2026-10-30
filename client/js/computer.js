// ============================================================
// Logic Chơi Với Máy Tính (Chess AI Engine)
// Thuật toán Minimax + Alpha-Beta Pruning + Piece-Square Tables
// ============================================================

let chess = null;
let board = null;
let playerColor = 'w'; // 'w' (Trắng) hoặc 'b' (Đen)
let aiDifficulty = 'medium'; // 'easy', 'medium', 'hard'
let isGameOver = false;

// Bảng giá trị cơ bản của quân cờ
const PIECE_VALUES = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000
};

// Bảng đánh giá vị trí chiến lược (Piece-Square Tables)
const PAWN_TABLE = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5,  5, 10, 25, 25, 10,  5,  5],
    [0,  0,  0, 20, 20,  0,  0,  0],
    [5, -5,-10,  0,  0,-10, -5,  5],
    [5, 10, 10,-20,-20, 10, 10,  5],
    [0,  0,  0,  0,  0,  0,  0,  0]
];

const KNIGHT_TABLE = [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,  0,  0,  0,  0,-20,-40],
    [-30,  0, 10, 15, 15, 10,  0,-30],
    [-30,  5, 15, 20, 20, 15,  5,-30],
    [-30,  0, 15, 20, 20, 15,  0,-30],
    [-30,  5, 10, 15, 15, 10,  5,-30],
    [-40,-20,  0,  5,  5,  0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
];

const BISHOP_TABLE = [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5, 10, 10,  5,  0,-10],
    [-10,  5,  5, 10, 10,  5,  5,-10],
    [-10,  0, 10, 10, 10, 10,  0,-10],
    [-10, 10, 10, 10, 10, 10, 10,-10],
    [-10,  5,  0,  0,  0,  0,  5,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
];

const ROOK_TABLE = [
    [0,  0,  0,  0,  0,  0,  0,  0],
    [5, 10, 10, 10, 10, 10, 10,  5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [-5,  0,  0,  0,  0,  0,  0, -5],
    [0,  0,  0,  5,  5,  0,  0,  0]
];

const QUEEN_TABLE = [
    [-20,-10,-10, -5, -5,-10,-10,-20],
    [-10,  0,  0,  0,  0,  0,  0,-10],
    [-10,  0,  5,  5,  5,  5,  0,-10],
    [-5,  0,  5,  5,  5,  5,  0, -5],
    [0,  0,  5,  5,  5,  5,  0, -5],
    [-10,  5,  5,  5,  5,  5,  0,-10],
    [-10,  0,  5,  0,  0,  0,  0,-10],
    [-20,-10,-10, -5, -5,-10,-10,-20]
];

const KING_TABLE = [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20, 20,  0,  0,  0,  0, 20, 20],
    [20, 30, 10,  0,  0, 10, 30, 20]
];

document.addEventListener('DOMContentLoaded', () => {
    chess = new Chess();
    board = new ChessboardUI('#chessboard-mount', {
        orientation: 'white',
        draggable: true,
        clickable: true,
        onSelect: handleSelect,
        onMove: handlePlayerMove
    });

    initControls();
    startNewGame();
});

let playerTurnTimer = null;
let playerTurnSeconds = 30;
let computerMovesHistory = [];

async function saveComputerGame(result, reason) {
    try {
        const user = (typeof Auth !== 'undefined' && Auth.getUser) ? Auth.getUser() : null;
        const moves = (computerMovesHistory && computerMovesHistory.length > 0)
            ? computerMovesHistory
            : (chess && chess.history ? chess.history() : []);
        if (!moves || moves.length === 0) return;

        await fetch('/api/games/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user ? user.id : 0,
                username: user ? user.username : 'Bạn',
                playerColor: playerColor,
                result: result,
                currentFen: chess.fen(),
                moveHistory: moves,
                difficulty: aiDifficulty
            })
        });
        console.log('[Computer] Ván đấu đã được lưu tự động vào CSDL để xem lại replay!');
    } catch (err) {
        console.warn('[Computer] Lỗi lưu ván đấu:', err);
    }
}

function startPlayerTurnTimer() {
    stopPlayerTurnTimer();
    if (isGameOver) return;
    playerTurnSeconds = 30;
    updatePlayerTimerDisplay();

    playerTurnTimer = setInterval(() => {
        if (isGameOver) {
            stopPlayerTurnTimer();
            return;
        }
        playerTurnSeconds--;
        updatePlayerTimerDisplay();

        if (playerTurnSeconds <= 0) {
            stopPlayerTurnTimer();
            handlePlayerTurnTimeoutLoss();
        }
    }, 1000);
}

function stopPlayerTurnTimer() {
    if (playerTurnTimer) {
        clearInterval(playerTurnTimer);
        playerTurnTimer = null;
    }
}

function updatePlayerTimerDisplay() {
    const urgentClass = playerTurnSeconds <= 5 ? 'style="color: #ef4444; font-weight: 800;"' : 'style="color: #86efac; font-weight: 700;"';
    updateStatus(`<i class="fas fa-stopwatch"></i> Đến lượt bạn đi (<span ${urgentClass}>${playerTurnSeconds}s</span>) - Quá 30s xử thua`);
}

function handlePlayerTurnTimeoutLoss() {
    if (isGameOver || chess.turn() !== playerColor) return;
    isGameOver = true;
    stopPlayerTurnTimer();
    ChessAudio.playGameOver();
    const lossRes = (playerColor === 'w') ? 'black_win' : 'white_win';
    saveComputerGame(lossRes, 'Bạn đã đi nước cờ quá 30 giây và bị xử THUA!');
    showGameOverModal('⏱️ Hết giờ!', 'Bạn đã không đi nước cờ trong vòng 30 giây và bị xử THUA!', 'defeat');
    updateStatus('<span style="color: #ef4444; font-weight: 800;">Bạn đã bị xử THUA do quá 30 giây!</span>');
}

function initControls() {
    // Chọn màu quân
    document.querySelectorAll('input[name="player-color"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            playerColor = e.target.value;
            startNewGame();
        });
    });

    // Chọn mức độ
    const diffSelect = document.getElementById('ai-difficulty');
    if (diffSelect) {
        diffSelect.addEventListener('change', (e) => {
            aiDifficulty = e.target.value;
            showToast(`Đã chuyển mức độ: ${diffSelect.options[diffSelect.selectedIndex].text}`, 'info');
        });
    }

    // Nút Ván mới
    document.getElementById('new-game-btn').addEventListener('click', startNewGame);

    // Lật bàn cờ
    document.getElementById('flip-board-btn').addEventListener('click', () => board.flip());

    // Nút Đầu hàng
    document.getElementById('resign-btn').addEventListener('click', () => {
        if (isGameOver) return;
        if (confirm('Bạn có chắc chắn muốn đầu hàng không?')) {
            isGameOver = true;
            stopPlayerTurnTimer();
            ChessAudio.playGameOver();
            const lossRes = (playerColor === 'w') ? 'black_win' : 'white_win';
            saveComputerGame(lossRes, 'Bạn đã đầu hàng');
            showGameOver('❌ BẠN ĐÃ BỊ XỬ THUA!', 'Bạn đã đầu hàng! Máy tính chiến thắng.');
        }
    });
}

function startNewGame() {
    stopPlayerTurnTimer();
    computerMovesHistory = [];
    chess.reset();
    isGameOver = false;

    const orientation = (playerColor === 'w') ? 'white' : 'black';
    board.setOrientation(orientation);
    board.setPosition(chess.fen());
    board.clearHighlights();

    renderMoveHistory();
    updateStatus('Ván cờ mới bắt đầu');

    // Nếu người chơi chọn Đen, máy đi trước
    if (playerColor === 'b') {
        makeAiMove();
    } else {
        startPlayerTurnTimer();
    }
}

function handleSelect(square) {
    if (isGameOver || isComputerReplayMode || chess.turn() !== playerColor) {
        board.clearLegalMoves();
        return;
    }
    if (!square) {
        board.clearLegalMoves();
        return;
    }
    const moves = chess.moves({ square, verbose: true });
    board.setLegalMoves(moves);
}

function handlePlayerMove({ from, to, promotion }) {
    if (isGameOver || isComputerReplayMode || chess.turn() !== playerColor) return false;

    try {
        const move = chess.move({ from, to, promotion: promotion || 'q' });
        if (!move) {
            board.setPosition(chess.fen());
            return false;
        }

        if (move && move.san) {
            computerMovesHistory.push(move.san);
        }

        stopPlayerTurnTimer();

        board.setPosition(chess.fen());
        board.setLastMove(from, to);

        if (move.captured) ChessAudio.playCapture();
        else ChessAudio.playMove();

        renderMoveHistory();

        if (move.captured === 'k' || move.captured === 'K') {
            isGameOver = true;
            stopPlayerTurnTimer();
            ChessAudio.playGameOver();
            const winRes = (playerColor === 'w') ? 'white_win' : 'black_win';
            saveComputerGame(winRes, 'Bắt được Vua máy tính');
            showGameOver('🏆 BẠN ĐÃ CHIẾN THẮNG!', 'Bạn đã bắt được Vua của máy tính và giành chiến thắng!');
            return true;
        }

        checkGameOver();

        if (!isGameOver) {
            // Đến lượt máy tính
            makeAiMove();
        }
        return true;
    } catch (e) {
        board.setPosition(chess.fen());
        return false;
    }
}

// Máy tính suy nghĩ và đi
function makeAiMove() {
    updateStatus('<i class="fas fa-spinner fa-spin"></i> Máy tính đang suy nghĩ...');

    setTimeout(() => {
        if (isGameOver) return;

        let bestMove = null;

        if (aiDifficulty === 'easy') {
            // Mức Dễ: 45% ngẫu nhiên, còn lại tính depth 1
            const legalMoves = chess.moves({ verbose: true });
            if (Math.random() < 0.45) {
                bestMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            } else {
                bestMove = getBestMoveMinimax(1);
            }
        } else if (aiDifficulty === 'medium') {
            // Mức Trung bình: Depth 2
            bestMove = getBestMoveMinimax(2);
        } else {
            // Mức Khó: Depth 3
            bestMove = getBestMoveMinimax(3);
        }

        if (bestMove) {
            const moveResult = chess.move(bestMove);
            if (moveResult && moveResult.san) {
                computerMovesHistory.push(moveResult.san);
            }

            board.setPosition(chess.fen());
            board.setLastMove(bestMove.from, bestMove.to);

            if (moveResult && moveResult.captured) ChessAudio.playCapture();
            else ChessAudio.playMove();

            if (moveResult && (moveResult.captured === 'k' || moveResult.captured === 'K')) {
                isGameOver = true;
                stopPlayerTurnTimer();
                ChessAudio.playGameOver();
                const lossRes = (playerColor === 'w') ? 'black_win' : 'white_win';
                saveComputerGame(lossRes, 'Máy tính bắt được Vua');
                showGameOver('❌ BẠN ĐÃ BỊ XỬ THUA!', 'Bạn bị mất quân Vua và bị xử THUA! Máy tính giành chiến thắng.');
                renderMoveHistory();
                return;
            }

            try {
                if (chess.inCheck()) {
                    ChessAudio.playCheck();
                    const kingSq = findKingSquare(chess.turn());
                    if (kingSq) board.setCheck(kingSq);
                } else {
                    board.clearCheck();
                }
            } catch (e) {
                board.clearCheck();
            }

            renderMoveHistory();
            checkGameOver();

            if (!isGameOver) {
                startPlayerTurnTimer();
            }
        }
    }, 350);
}

// ================= AI ALGORITHM (MINIMAX + ALPHA BETA) =================
function getBestMoveMinimax(depth) {
    const moves = chess.moves({ verbose: true });
    if (moves.length === 0) return null;

    // Sắp xếp nước đi (ưu tiên ăn quân trước để tỉa nhánh Alpha-Beta nhanh hơn)
    moves.sort((a, b) => (b.captured ? 10 : 0) - (a.captured ? 10 : 0));

    let bestMove = moves[0];
    const isAiWhite = (playerColor === 'b');
    let bestValue = isAiWhite ? -Infinity : Infinity;

    for (let i = 0; i < moves.length; i++) {
        chess.move(moves[i]);
        const value = minimax(depth - 1, -Infinity, Infinity, !isAiWhite);
        chess.undo();

        if (isAiWhite) {
            if (value > bestValue) {
                bestValue = value;
                bestMove = moves[i];
            }
        } else {
            if (value < bestValue) {
                bestValue = value;
                bestMove = moves[i];
            }
        }
    }
    return bestMove;
}

function minimax(depth, alpha, beta, isMaximizingPlayer) {
    if (depth === 0 || chess.isGameOver()) {
        return evaluateBoard();
    }

    const moves = chess.moves({ verbose: true });

    if (isMaximizingPlayer) {
        let maxEval = -Infinity;
        for (let i = 0; i < moves.length; i++) {
            chess.move(moves[i]);
            const evaluation = minimax(depth - 1, alpha, beta, false);
            chess.undo();
            maxEval = Math.max(maxEval, evaluation);
            alpha = Math.max(alpha, evaluation);
            if (beta <= alpha) break; // Tỉa nhánh Beta
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let i = 0; i < moves.length; i++) {
            chess.move(moves[i]);
            const evaluation = minimax(depth - 1, alpha, beta, true);
            chess.undo();
            minEval = Math.min(minEval, evaluation);
            beta = Math.min(beta, evaluation);
            if (beta <= alpha) break; // Tỉa nhánh Alpha
        }
        return minEval;
    }
}

// Hàm đánh giá thế trận theo chuẩn quốc tế
function evaluateBoard() {
    let totalScore = 0;
    const boardArr = chess.board();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = boardArr[r][c];
            if (piece) {
                const val = getPieceValue(piece, r, c);
                totalScore += (piece.color === 'w') ? val : -val;
            }
        }
    }
    return totalScore;
}

function getPieceValue(piece, row, col) {
    const base = PIECE_VALUES[piece.type] || 0;
    let posBonus = 0;
    const r = (piece.color === 'w') ? row : (7 - row);

    switch (piece.type) {
        case 'p': posBonus = PAWN_TABLE[r][col]; break;
        case 'n': posBonus = KNIGHT_TABLE[r][col]; break;
        case 'b': posBonus = BISHOP_TABLE[r][col]; break;
        case 'r': posBonus = ROOK_TABLE[r][col]; break;
        case 'q': posBonus = QUEEN_TABLE[r][col]; break;
        case 'k': posBonus = KING_TABLE[r][col]; break;
    }
    return base + posBonus;
}

function checkGameOver() {
    if (chess.isGameOver()) {
        isGameOver = true;
        stopPlayerTurnTimer();
        ChessAudio.playGameOver();

        let gameRes = 'draw';
        if (chess.isCheckmate()) {
            gameRes = (chess.turn() === 'w') ? 'black_win' : 'white_win';
            const winner = chess.turn() === 'w' ? 'Đen' : 'Trắng';
            const isUserWinner = (chess.turn() !== playerColor);
            const title = isUserWinner ? '🏆 BẠN ĐÃ CHIẾN THẮNG!' : '❌ BẠN ĐÃ BỊ XỬ THUA!';
            showGameOver(title, `Chiếu hết đối thủ (Bên ${winner} thắng).`);
        } else if (chess.isStalemate()) {
            showGameOver('🤝 HÒA CỜ!', 'Hòa vì hết nước đi hợp lệ (Stalemate).');
        } else if (chess.isThreefoldRepetition()) {
            showGameOver('🤝 HÒA CỜ!', 'Hòa do lặp lại thế cờ 3 lần.');
        } else if (chess.isInsufficientMaterial()) {
            showGameOver('🤝 HÒA CỜ!', 'Hòa do thiếu lực lượng chiếu hết.');
        } else {
            const winner = chess.turn() === 'w' ? 'Đen' : 'Trắng';
            const isUserWinner = (chess.turn() !== playerColor);
            const title = isUserWinner ? '🏆 BẠN ĐÃ CHIẾN THẮNG!' : '❌ BẠN ĐÃ BỊ XỬ THUA!';
            showGameOver(title, `Ván cờ kết thúc (Bên ${winner} chiến thắng).`);
        }

        saveComputerGame(gameRes, 'Ván cờ kết thúc');
    }
}

function showGameOver(title, reason) {
    document.getElementById('game-over-title').textContent = title;
    document.getElementById('game-over-reason').textContent = reason;
    document.getElementById('game-over-modal').classList.add('active');
}

function updateStatus(html) {
    const el = document.getElementById('game-status-text');
    if (el) el.innerHTML = html;
}

function renderMoveHistory() {
    const history = chess.history();
    const tbody = document.getElementById('moves-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
        const tr = document.createElement('tr');
        const moveNum = Math.floor(i / 2) + 1;
        tr.innerHTML = `
            <td class="move-num">${moveNum}.</td>
            <td class="move-white">${history[i] || ''}</td>
            <td class="move-black">${history[i + 1] || ''}</td>
        `;
        tbody.appendChild(tr);
    }
    const container = document.querySelector('.moves-table-container');
    if (container) container.scrollTop = container.scrollHeight;
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

// ================= CHỨC NĂNG XEM LẠI VÁN CỜ ĐẤU VỚI MÁY (REPLAY) =================
let isComputerReplayMode = false;
let computerReplayChess = null;
let computerReplayHistory = [];
let computerReplayIndex = 0;
let computerReplayAutoInterval = null;
let computerReplaySpeedMultiplier = 1.0;
const COMP_REPLAY_SPEEDS = {
    0.5: 1800,
    1.0: 900,
    1.5: 600,
    2.0: 350
};

function jumpComputerReplayMoves(delta) {
    if (!computerReplayHistory || computerReplayHistory.length === 0) return;
    const target = Math.max(0, Math.min(computerReplayHistory.length, computerReplayIndex + delta));
    if (target !== computerReplayIndex) {
        computerReplayIndex = target;
        updateComputerReplayView();
    }
}

function setComputerReplaySpeed(speed) {
    computerReplaySpeedMultiplier = speed;
    document.querySelectorAll('.comp-speed-btn').forEach(btn => {
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

    if (computerReplayAutoInterval) {
        clearInterval(computerReplayAutoInterval);
        const intervalMs = COMP_REPLAY_SPEEDS[computerReplaySpeedMultiplier] || 900;
        computerReplayAutoInterval = setInterval(() => {
            if (computerReplayIndex < computerReplayHistory.length) {
                computerReplayIndex++;
                updateComputerReplayView();
            } else {
                clearInterval(computerReplayAutoInterval);
                computerReplayAutoInterval = null;
                const playBtn = document.getElementById('replay-play-btn');
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
            }
        }, intervalMs);
    }
}

function startComputerReplay() {
    isComputerReplayMode = true;
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.classList.remove('active');

    computerReplayHistory = (computerMovesHistory && computerMovesHistory.length > 0)
        ? [...computerMovesHistory]
        : ((chess && chess.history && chess.history().length > 0) ? chess.history() : []);

    if (!computerReplayHistory || computerReplayHistory.length === 0) {
        showToast('Ván cờ chưa có nước đi nào để xem lại!', 'info');
        isComputerReplayMode = false;
        return;
    }

    if (!computerReplayChess) computerReplayChess = new Chess();

    const bar = document.getElementById('replay-controls-bar');
    if (bar) bar.style.display = 'flex';

    computerReplayIndex = 0;

    const slider = document.getElementById('comp-replay-timeline-slider');
    const currLabel = document.getElementById('comp-replay-slider-curr');
    const maxLabel = document.getElementById('comp-replay-slider-max');
    if (slider) {
        slider.max = computerReplayHistory.length;
        slider.value = 0;
    }
    if (currLabel) currLabel.textContent = '0';
    if (maxLabel) maxLabel.textContent = computerReplayHistory.length.toString();

    updateComputerReplayView();
    showToast('Chế độ xem lại: Dùng phím ← / → để tua nước cờ, Space để phát!', 'info');
}

function exitComputerReplay() {
    isComputerReplayMode = false;
    if (computerReplayAutoInterval) {
        clearInterval(computerReplayAutoInterval);
        computerReplayAutoInterval = null;
        const playBtn = document.getElementById('replay-play-btn');
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
    }

    const bar = document.getElementById('replay-controls-bar');
    if (bar) bar.style.display = 'none';

    if (board && chess) {
        board.setPosition(chess.fen());
        if (typeof board.clearHighlights === 'function') {
            board.clearHighlights();
        } else {
            if (board.clearSelection) board.clearSelection();
            if (board.clearCheck) board.clearCheck();
        }
    }
}

function updateComputerReplayView() {
    if (!computerReplayChess || !board) return;
    computerReplayChess.reset();
    let lastMove = null;

    for (let i = 0; i < computerReplayIndex; i++) {
        try {
            lastMove = computerReplayChess.move(computerReplayHistory[i]);
        } catch (e) {}
    }

    board.setPosition(computerReplayChess.fen());

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
        if (computerReplayIndex === 0) {
            statusEl.textContent = 'Trạng thái ban đầu';
        } else {
            const moveNum = Math.ceil(computerReplayIndex / 2);
            const isWhite = (computerReplayIndex % 2 !== 0);
            const san = computerReplayHistory[computerReplayIndex - 1];
            statusEl.textContent = `Nước ${moveNum}: ${isWhite ? 'Trắng' : 'Đen'} ${san} (${computerReplayIndex}/${computerReplayHistory.length})`;
        }
    }

    // Cập nhật Slider và Label
    const slider = document.getElementById('comp-replay-timeline-slider');
    const currLabel = document.getElementById('comp-replay-slider-curr');
    const maxLabel = document.getElementById('comp-replay-slider-max');
    if (slider) {
        slider.value = computerReplayIndex;
        slider.max = computerReplayHistory.length;
    }
    if (currLabel) currLabel.textContent = computerReplayIndex.toString();
    if (maxLabel) maxLabel.textContent = computerReplayHistory.length.toString();
}

function toggleComputerReplayAutoPlay() {
    const playBtn = document.getElementById('replay-play-btn');
    if (computerReplayAutoInterval) {
        clearInterval(computerReplayAutoInterval);
        computerReplayAutoInterval = null;
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
    } else {
        if (computerReplayIndex >= computerReplayHistory.length) {
            computerReplayIndex = 0;
            updateComputerReplayView();
        }
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i> Dừng';
        const intervalMs = COMP_REPLAY_SPEEDS[computerReplaySpeedMultiplier] || 900;
        computerReplayAutoInterval = setInterval(() => {
            if (computerReplayIndex < computerReplayHistory.length) {
                computerReplayIndex++;
                updateComputerReplayView();
            } else {
                clearInterval(computerReplayAutoInterval);
                computerReplayAutoInterval = null;
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i> Phát';
            }
        }, intervalMs);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnFirst = document.getElementById('replay-first-btn');
    if (btnFirst) btnFirst.addEventListener('click', () => { computerReplayIndex = 0; updateComputerReplayView(); });
    const btnJumpB10 = document.getElementById('replay-jump-back-10');
    if (btnJumpB10) btnJumpB10.addEventListener('click', () => jumpComputerReplayMoves(-10));
    const btnJumpB5 = document.getElementById('replay-jump-back-5');
    if (btnJumpB5) btnJumpB5.addEventListener('click', () => jumpComputerReplayMoves(-5));
    const btnPrev = document.getElementById('replay-prev-btn');
    if (btnPrev) btnPrev.addEventListener('click', () => jumpComputerReplayMoves(-1));
    const btnNext = document.getElementById('replay-next-btn');
    if (btnNext) btnNext.addEventListener('click', () => jumpComputerReplayMoves(1));
    const btnJumpF5 = document.getElementById('replay-jump-fwd-5');
    if (btnJumpF5) btnJumpF5.addEventListener('click', () => jumpComputerReplayMoves(5));
    const btnJumpF10 = document.getElementById('replay-jump-fwd-10');
    if (btnJumpF10) btnJumpF10.addEventListener('click', () => jumpComputerReplayMoves(10));
    const btnLast = document.getElementById('replay-last-btn');
    if (btnLast) btnLast.addEventListener('click', () => { computerReplayIndex = computerReplayHistory.length; updateComputerReplayView(); });
    const btnPlay = document.getElementById('replay-play-btn');
    if (btnPlay) btnPlay.addEventListener('click', toggleComputerReplayAutoPlay);
    const btnExit = document.getElementById('replay-exit-btn');
    if (btnExit) btnExit.addEventListener('click', exitComputerReplay);

    // Thanh tua slider
    const compSlider = document.getElementById('comp-replay-timeline-slider');
    if (compSlider) {
        compSlider.addEventListener('input', (e) => {
            computerReplayIndex = parseInt(e.target.value, 10) || 0;
            updateComputerReplayView();
        });
    }

    // Nút chọn tốc độ
    document.querySelectorAll('.comp-speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sp = parseFloat(btn.dataset.speed) || 1.0;
            setComputerReplaySpeed(sp);
        });
    });

    window.addEventListener('keydown', (e) => {
        if (!isComputerReplayMode) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            jumpComputerReplayMoves(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            jumpComputerReplayMoves(1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            jumpComputerReplayMoves(-5);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            jumpComputerReplayMoves(5);
        } else if (e.key === 'Home') {
            e.preventDefault();
            computerReplayIndex = 0;
            updateComputerReplayView();
        } else if (e.key === 'End') {
            e.preventDefault();
            computerReplayIndex = computerReplayHistory.length;
            updateComputerReplayView();
        } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            toggleComputerReplayAutoPlay();
        } else if (e.key === 'Escape') {
            exitComputerReplay();
        }
    });
});

