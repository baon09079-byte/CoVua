/**
 * Modern Interactive Chessboard UI
 * Hỗ trợ: Kéo thả (Mouse & Touch), Nhấp ô (Click-to-Move), Đổi giao diện màu bàn cờ (Themes),
 * Thanh đánh giá ưu thế (Evaluation Bar), và Bảng quân cờ bị bắt (Captured Pieces).
 */

class ChessboardUI {
    constructor(container, config = {}) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this.container) throw new Error('Không tìm thấy container cho bàn cờ');

        this.config = {
            orientation: 'white', // 'white' hoặc 'black'
            draggable: true,
            clickable: true,
            showCoordinates: true,
            showEvalBar: false,
            pieceTheme: '/img/pieces/{piece}.svg',
            onMove: () => true,
            onPromotion: null,
            ...config
        };

        this.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        this.selectedSquare = null;
        this.legalMoves = [];
        this.lastMove = null;
        this.checkSquare = null;

        // Drag state
        this.isDragging = false;
        this.dragSource = null;
        this.dragPieceKey = null;
        this.floatingEl = null;

        this.init();
    }

    init() {
        // Load saved theme
        const savedTheme = localStorage.getItem('chess_board_theme') || 'tournament';
        this.setTheme(savedTheme, false);

        this.container.innerHTML = `
            <div class="board-with-eval">
                ${this.config.showEvalBar ? `
                <div class="eval-bar-wrapper" id="eval-bar-wrapper" title="Thanh đánh giá ưu thế">
                    <div class="eval-bar-white" id="eval-bar-white"></div>
                </div>` : ''}
                <div class="chessboard-wrapper">
                    <div class="chessboard"></div>
                </div>
            </div>
        `;

        this.boardEl = this.container.querySelector('.chessboard');
        this.evalWhiteEl = this.container.querySelector('#eval-bar-white');

        this.renderSquares();
        this.attachGlobalEvents();
        this.setPosition(this.fen);
    }

    setTheme(themeName, save = true) {
        document.body.classList.remove('theme-wood', 'theme-cyber', 'theme-midnight', 'theme-marble');
        if (themeName !== 'tournament') {
            document.body.classList.add(`theme-${themeName}`);
        }
        if (save) {
            localStorage.setItem('chess_board_theme', themeName);
        }
    }

    // Cập nhật thanh ưu thế thế trận (Evaluation score tính bằng centipawns: +100 = Trắng hơn 1 Tốt)
    updateEvalBar(scoreInCp) {
        if (!this.evalWhiteEl) return;
        // Chuyển score sang phần trăm hiển thị (50% = cân bằng, 100% = Trắng thắng hoàn toàn, 0% = Đen thắng)
        // Dùng hàm sigmoid logistic
        const percent = 100 / (1 + Math.exp(-scoreInCp / 400));
        const clamped = Math.max(5, Math.min(95, percent));
        this.evalWhiteEl.style.height = `${clamped}%`;
    }

    getSquareList() {
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

        if (this.config.orientation === 'black') {
            files.reverse();
            ranks.reverse();
        }

        const list = [];
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                list.push({
                    square: files[f] + ranks[r],
                    file: files[f],
                    rank: ranks[r],
                    isLight: (f + r) % 2 === 0
                });
            }
        }
        return list;
    }

    renderSquares() {
        this.boardEl.innerHTML = '';
        const squares = this.getSquareList();

        squares.forEach((sqData, index) => {
            const sqEl = document.createElement('div');
            sqEl.className = `square ${sqData.isLight ? 'light' : 'dark'}`;
            sqEl.dataset.square = sqData.square;

            if (this.config.showCoordinates) {
                if (Math.floor(index / 8) === 7) {
                    const fileLabel = document.createElement('span');
                    fileLabel.className = 'coord-file';
                    fileLabel.textContent = sqData.file;
                    sqEl.appendChild(fileLabel);
                }
                if (index % 8 === 0) {
                    const rankLabel = document.createElement('span');
                    rankLabel.className = 'coord-rank';
                    rankLabel.textContent = sqData.rank;
                    sqEl.appendChild(rankLabel);
                }
            }

            this.boardEl.appendChild(sqEl);
        });
    }

    parseFen(fen) {
        const board = {};
        const parts = fen.split(' ');
        const rows = parts[0].split('/');

        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        for (let r = 0; r < 8; r++) {
            const rank = (8 - r).toString();
            let col = 0;
            for (let c = 0; c < rows[r].length; c++) {
                const char = rows[r][c];
                if (/\d/.test(char)) {
                    col += parseInt(char, 10);
                } else {
                    const square = files[col] + rank;
                    const color = char === char.toUpperCase() ? 'w' : 'b';
                    const piece = color + char.toUpperCase();
                    board[square] = piece;
                    col++;
                }
            }
        }
        return board;
    }

    setPosition(fen) {
        this.fen = fen;
        const pieceMap = this.parseFen(fen);

        this.boardEl.querySelectorAll('.piece').forEach(p => p.remove());

        for (const [square, pieceKey] of Object.entries(pieceMap)) {
            const sqEl = this.boardEl.querySelector(`[data-square="${square}"]`);
            if (sqEl) {
                const pieceEl = document.createElement('div');
                pieceEl.className = 'piece';
                pieceEl.dataset.piece = pieceKey;
                pieceEl.style.backgroundImage = `url("${this.config.pieceTheme.replace('{piece}', pieceKey)}")`;
                sqEl.appendChild(pieceEl);
            }
        }

        this.applyHighlights();
        this.updateCapturedTray(pieceMap);
    }

    // Tính toán quân cờ bị bắt và điểm chênh lệch vật chất (Material Advantage)
    updateCapturedTray(currentPieces) {
        const initial = {
            wP: 8, wN: 2, wB: 2, wR: 2, wQ: 1, wK: 1,
            bP: 8, bN: 2, bB: 2, bR: 2, bQ: 1, bK: 1
        };
        const pieceScores = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };

        const currentCounts = {};
        Object.values(currentPieces).forEach(p => {
            currentCounts[p] = (currentCounts[p] || 0) + 1;
        });

        const capturedByWhite = []; // Quân Đen bị Trắng bắt
        const capturedByBlack = []; // Quân Trắng bị Đen bắt

        let whitePoints = 0;
        let blackPoints = 0;

        ['P', 'N', 'B', 'R', 'Q', 'K'].forEach(type => {
            const deadBlack = (initial['b' + type] || 0) - (currentCounts['b' + type] || 0);
            for (let i = 0; i < deadBlack; i++) {
                capturedByWhite.push('b' + type);
                whitePoints += pieceScores[type];
            }

            const deadWhite = (initial['w' + type] || 0) - (currentCounts['w' + type] || 0);
            for (let i = 0; i < deadWhite; i++) {
                capturedByBlack.push('w' + type);
                blackPoints += pieceScores[type];
            }
        });

        const whiteDiff = whitePoints - blackPoints;
        const blackDiff = blackPoints - whitePoints;

        // Render ra các tray nếu có trong DOM
        const whiteTray = document.getElementById('white-captured-tray');
        const blackTray = document.getElementById('black-captured-tray');

        if (whiteTray) {
            whiteTray.innerHTML = capturedByWhite.map(p => `<img src="/img/pieces/${p}.svg" alt="">`).join('') +
                (whiteDiff > 0 ? `<span class="material-diff">+${whiteDiff}</span>` : '');
        }
        if (blackTray) {
            blackTray.innerHTML = capturedByBlack.map(p => `<img src="/img/pieces/${p}.svg" alt="">`).join('') +
                (blackDiff > 0 ? `<span class="material-diff">+${blackDiff}</span>` : '');
        }
    }

    applyHighlights() {
        this.boardEl.querySelectorAll('.square').forEach(sq => {
            sq.classList.remove('selected', 'last-move', 'in-check');
            const dot = sq.querySelector('.hint-dot, .hint-capture');
            if (dot) dot.remove();
        });

        if (this.selectedSquare) {
            const sqEl = this.boardEl.querySelector(`[data-square="${this.selectedSquare}"]`);
            if (sqEl) sqEl.classList.add('selected');
        }

        if (this.lastMove) {
            const fromEl = this.boardEl.querySelector(`[data-square="${this.lastMove.from}"]`);
            const toEl = this.boardEl.querySelector(`[data-square="${this.lastMove.to}"]`);
            if (fromEl) fromEl.classList.add('last-move');
            if (toEl) toEl.classList.add('last-move');
        }

        if (this.checkSquare) {
            const checkEl = this.boardEl.querySelector(`[data-square="${this.checkSquare}"]`);
            if (checkEl) checkEl.classList.add('in-check');
        }

        if (this.legalMoves && this.legalMoves.length > 0) {
            this.legalMoves.forEach(move => {
                const targetSquare = typeof move === 'string' ? move : (move.to || move);
                const sqEl = this.boardEl.querySelector(`[data-square="${targetSquare}"]`);
                if (sqEl) {
                    const hasPiece = sqEl.querySelector('.piece');
                    const hintEl = document.createElement('div');
                    hintEl.className = hasPiece ? 'hint-capture' : 'hint-dot';
                    sqEl.appendChild(hintEl);
                }
            });
        }
    }

    setOrientation(orientation) {
        if (this.config.orientation !== orientation) {
            this.config.orientation = orientation;
            this.renderSquares();
            this.setPosition(this.fen);
        }
    }

    flip() {
        this.setOrientation(this.config.orientation === 'white' ? 'black' : 'white');
    }

    setLastMove(from, to) {
        this.lastMove = { from, to };
        this.applyHighlights();
    }

    setCheck(square) {
        this.checkSquare = square;
        this.applyHighlights();
    }

    clearCheck() {
        this.checkSquare = null;
        this.applyHighlights();
    }

    clearHighlights() {
        this.selectedSquare = null;
        this.legalMoves = [];
        this.lastMove = null;
        this.checkSquare = null;
        this.applyHighlights();
    }

    setLegalMoves(moves) {
        this.legalMoves = moves;
        this.applyHighlights();
    }

    clearLegalMoves() {
        this.legalMoves = [];
        this.applyHighlights();
    }

    selectSquare(square) {
        this.selectedSquare = square;
        this.applyHighlights();
    }

    clearSelection() {
        this.selectedSquare = null;
        this.legalMoves = [];
        this.applyHighlights();
    }

    attachGlobalEvents() {
        this.boardEl.addEventListener('pointerdown', (e) => {
            const sqEl = e.target.closest('.square');
            if (!sqEl) return;
            const square = sqEl.dataset.square;
            const pieceEl = sqEl.querySelector('.piece');

            if (this.selectedSquare && this.isLegalTarget(square)) {
                this.executeMove(this.selectedSquare, square);
                return;
            }

            if (pieceEl) {
                const pieceKey = pieceEl.dataset.piece;
                this.selectSquare(square);

                if (typeof this.config.onSelect === 'function') {
                    this.config.onSelect(square, pieceKey);
                }

                if (this.config.draggable) {
                    this.startDrag(e, square, pieceKey, pieceEl);
                }
            } else {
                this.clearSelection();
                if (typeof this.config.onSelect === 'function') {
                    this.config.onSelect(null);
                }
            }
        });

        window.addEventListener('pointermove', (e) => {
            if (!this.isDragging || !this.floatingEl) return;
            this.floatingEl.style.left = `${e.clientX}px`;
            this.floatingEl.style.top = `${e.clientY}px`;
        });

        window.addEventListener('pointerup', (e) => {
            if (!this.isDragging) return;
            this.endDrag(e);
        });
    }

    isLegalTarget(targetSquare) {
        return this.legalMoves.some(m => {
            const to = typeof m === 'string' ? m : m.to;
            return to === targetSquare;
        });
    }

    startDrag(e, square, pieceKey, pieceEl) {
        this.isDragging = true;
        this.dragSource = square;
        this.dragPieceKey = pieceKey;

        this.floatingEl = document.createElement('div');
        this.floatingEl.className = 'floating-drag-piece';
        this.floatingEl.style.backgroundImage = `url("${this.config.pieceTheme.replace('{piece}', pieceKey)}")`;
        this.floatingEl.style.left = `${e.clientX}px`;
        this.floatingEl.style.top = `${e.clientY}px`;
        document.body.appendChild(this.floatingEl);

        pieceEl.classList.add('dragging');
    }

    endDrag(e) {
        this.isDragging = false;
        if (this.floatingEl) {
            this.floatingEl.remove();
            this.floatingEl = null;
        }

        this.boardEl.querySelectorAll('.piece.dragging').forEach(p => p.classList.remove('dragging'));

        const dropTarget = document.elementFromPoint(e.clientX, e.clientY);
        const sqEl = dropTarget ? dropTarget.closest('.square') : null;

        if (sqEl && this.dragSource) {
            const targetSquare = sqEl.dataset.square;
            if (targetSquare !== this.dragSource) {
                this.executeMove(this.dragSource, targetSquare);
            }
        }
        this.dragSource = null;
        this.dragPieceKey = null;
    }

    executeMove(from, to) {
        const pieceMap = this.parseFen(this.fen);
        const piece = pieceMap[from];
        const isPawn = piece && (piece === 'wP' || piece === 'bP');
        const isPromotionRank = (piece === 'wP' && to.endsWith('8')) || (piece === 'bP' && to.endsWith('1'));

        // Tự động phong cấp thành Hậu (Queen) lập tức, không qua hộp thoại chọn
        if (isPawn && isPromotionRank) {
            this.finishMove(from, to, 'q');
            return;
        }

        this.finishMove(from, to, null);
    }

    finishMove(from, to, promotion) {
        this.clearSelection();
        if (typeof this.config.onMove === 'function') {
            this.config.onMove({ from, to, promotion });
        }
    }
}

window.ChessboardUI = ChessboardUI;

