const db = require('../database/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'chess_online_secret_key_2026_nhom6';

exports.register = async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
        }

        if (username.length < 3) {
            return res.status(400).json({ message: 'Tên người dùng phải có ít nhất 3 ký tự' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }
        
        // Kiểm tra xem user đã tồn tại chưa
        const [existingUser] = await db.execute(
            'SELECT * FROM Users WHERE username = ? OR email = ?',
            [username, email]
        );
        
        if (existingUser && existingUser.length > 0) {
            return res.status(400).json({ message: 'Tên đăng nhập hoặc email đã tồn tại' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        await db.execute(
            'INSERT INTO Users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );
        
        res.status(201).json({ message: 'Đăng ký thành công! Hãy đăng nhập.' });
    } catch (error) {
        console.error('Lỗi đăng ký:', error);
        res.status(500).json({ message: 'Lỗi máy chủ khi đăng ký' });
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ message: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
        }

        const [users] = await db.execute('SELECT * FROM Users WHERE username = ? OR email = ?', [username, username]);
        const user = users && users[0];
        
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            message: 'Đăng nhập thành công',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Lỗi đăng nhập:', error);
        res.status(500).json({ message: 'Lỗi máy chủ khi đăng nhập' });
    }
};

exports.getMe = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Không có quyền truy cập' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const [users] = await db.execute('SELECT id, username, email FROM Users WHERE id = ?', [decoded.id]);
        
        if (!users || users.length === 0) return res.status(404).json({ message: 'Người dùng không tồn tại' });
        
        res.json(users[0]);
    } catch (error) {
        res.status(401).json({ message: 'Phiên đăng nhập hết hạn hoặc không hợp lệ' });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Không có quyền truy cập' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const { username } = req.body;
        
        if (!username || username.trim().length < 3) {
            return res.status(400).json({ message: 'Tên hiển thị phải có ít nhất 3 ký tự' });
        }

        // Kiểm tra xem tên mới có trùng ai khác không
        const [existing] = await db.execute('SELECT * FROM Users WHERE username = ?', [username.trim()]);
        if (existing && existing.length > 0 && existing[0].id !== decoded.id) {
            return res.status(400).json({ message: 'Tên đăng nhập này đã có người sử dụng' });
        }

        await db.execute('UPDATE Users SET username = ? WHERE id = ?', [username.trim(), decoded.id]);
        
        res.json({ message: 'Cập nhật thông tin thành công', username: username.trim() });
    } catch (error) {
        console.error('Lỗi cập nhật hồ sơ:', error);
        res.status(500).json({ message: 'Lỗi máy chủ' });
    }
};

