const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
app.set('io', io);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cung cấp các file tĩnh phía client
const clientDir = path.join(__dirname, '../client');
app.use(express.static(clientDir));

// Cung cấp chess.js từ node_modules nếu client cần dùng trực tiếp
app.get('/vendor/chess.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'node_modules/chess.js/dist/cjs/chess.js'));
});

// Các API routes
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const gameRoutes = require('./routes/games');

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);

// Lấy thông tin IP mạng LAN của máy chủ để bạn bè kết nối qua điện thoại / Wi-Fi
const os = require('os');
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    let bestIp = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('vpn') || lowerName.includes('virtual') || lowerName.includes('radmin') || lowerName.includes('teredo')) {
            continue;
        }
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                // Ưu tiên dải mạng LAN tiêu chuẩn gia đình / văn phòng
                if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || iface.address.startsWith('172.')) {
                    return iface.address;
                }
                bestIp = iface.address;
            }
        }
    }
    return bestIp;
}

app.get('/api/server-info', (req, res) => {
    const ip = getLocalIp();
    res.json({
        ip,
        port: PORT,
        origin: `http://${ip}:${PORT}`
    });
});

// Định tuyến đường dẫn trực tiếp thân thiện
app.get('/login', (req, res) => res.sendFile(path.join(clientDir, 'pages/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(clientDir, 'pages/register.html')));
app.get('/rooms', (req, res) => res.sendFile(path.join(clientDir, 'pages/rooms.html')));
app.get('/game', (req, res) => res.sendFile(path.join(clientDir, 'pages/game.html')));
app.get('/computer', (req, res) => res.sendFile(path.join(clientDir, 'pages/computer.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(clientDir, 'pages/profile.html')));

// Socket.IO
const chessSocket = require('./sockets/chess');
chessSocket(io);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`==============================================================`);
    console.log(` ♟ CHESS ONLINE - HỆ THỐNG ĐANG HOẠT ĐỘNG TẠI: http://localhost:${PORT}`);
    const localIp = getLocalIp();
    console.log(`   - Mạng LAN (Điện thoại/máy khác): http://${localIp}:${PORT}/`);
    console.log(`   - Trang chủ:          http://localhost:${PORT}/`);
    console.log(`   - Đăng nhập:          http://localhost:${PORT}/pages/login.html`);
    console.log(`   - Danh sách phòng:    http://localhost:${PORT}/pages/rooms.html`);
    console.log(`   - Chơi với máy:       http://localhost:${PORT}/pages/computer.html`);
    console.log(`==============================================================`);
});

