// Web Audio API Chess Sound Effects
// Không phụ thuộc vào file MP3 bên ngoài, hoạt động 100% offline và tức thì
const ChessAudio = {
    ctx: null,

    init() {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
    },

    playTone(freq, type, duration, gainValue = 0.15) {
        try {
            this.init();
            if (!this.ctx) return;
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

            gain.gain.setValueAtTime(gainValue, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            // Âm thanh tuỳ chọn, bỏ qua nếu trình duyệt chặn
        }
    },

    playMove() {
        // Âm gõ quân cờ nhẹ (woody click)
        this.playTone(320, 'sine', 0.08, 0.2);
    },

    playCapture() {
        // Âm ăn quân mạnh hơn
        this.playTone(180, 'triangle', 0.12, 0.28);
    },

    playCheck() {
        // Âm cảnh báo chiếu vua (2 nốt liên tiếp)
        this.playTone(520, 'sine', 0.1, 0.25);
        setTimeout(() => this.playTone(660, 'sine', 0.15, 0.25), 80);
    },

    playGameOver() {
        // Hợp âm kết thúc trận đấu
        this.playTone(440, 'sine', 0.2, 0.2);
        setTimeout(() => this.playTone(554.37, 'sine', 0.2, 0.2), 100);
        setTimeout(() => this.playTone(659.25, 'sine', 0.35, 0.25), 200);
    },

    playNotify() {
        // Âm thông báo tin nhắn chat
        this.playTone(800, 'sine', 0.08, 0.15);
    }
};

window.ChessAudio = ChessAudio;

