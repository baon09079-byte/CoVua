// ============================================================
// Auth & Navigation Utilities
// ============================================================

// Tự động dọn dẹp nếu localStorage từng bị lưu token giả Khách_
if (typeof window !== 'undefined' && window.localStorage) {
    const tok = localStorage.getItem('chess_token');
    if (tok && tok.startsWith('guest_token_')) {
        localStorage.removeItem('chess_token');
        localStorage.removeItem('chess_user');
    }
}

const Auth = {
    getToken() {
        return localStorage.getItem('chess_token');
    },

    setToken(token) {
        if (token) localStorage.setItem('chess_token', token);
        else localStorage.removeItem('chess_token');
    },

    getUser() {
        const u = localStorage.getItem('chess_user');
        try {
            return u ? JSON.parse(u) : null;
        } catch (e) {
            return null;
        }
    },

    setUser(user) {
        if (user) localStorage.setItem('chess_user', JSON.stringify(user));
        else localStorage.removeItem('chess_user');
    },

    isLoggedIn() {
        const token = this.getToken();
        const user = this.getUser();
        if (!token || !user) return false;
        if (token.startsWith('guest_token_')) return false;
        return true;
    },

    logout() {
        localStorage.removeItem('chess_token');
        localStorage.removeItem('chess_user');
        window.location.href = '/';
    },

    async fetchWithAuth(url, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return fetch(url, { ...options, headers });
    }
};

// Toast notification helper
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';

    toast.innerHTML = `<i class="fas fa-${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Cập nhật thanh điều hướng
function updateNav() {
    const user = Auth.getUser();
    const navLinks = document.getElementById('nav-links');
    if (!navLinks) return;

    if (Auth.isLoggedIn() && user) {
        // Đã đăng nhập
        navLinks.innerHTML = `
            <li><a href="/"><i class="fas fa-home"></i> Trang chủ</a></li>
            <li><a href="/pages/rooms.html"><i class="fas fa-chess-board"></i> Phòng chơi</a></li>
            <li><a href="/pages/computer.html"><i class="fas fa-robot"></i> Đấu với máy</a></li>
            <li><a href="/pages/profile.html"><i class="fas fa-user-circle"></i> Hồ sơ</a></li>
            <li>
                <span class="user-badge"><i class="fas fa-user"></i> ${user.username}</span>
            </li>
            <li><a href="#" id="logout-btn" class="btn btn-secondary btn-sm"><i class="fas fa-sign-out-alt"></i> Đăng xuất</a></li>
        `;
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                Auth.logout();
            });
        }
    } else {
        // Khách
        navLinks.innerHTML = `
            <li><a href="/"><i class="fas fa-home"></i> Trang chủ</a></li>
            <li><a href="/pages/computer.html"><i class="fas fa-robot"></i> Đấu với máy</a></li>
            <li><a href="/pages/login.html" class="btn btn-secondary btn-sm"><i class="fas fa-sign-in-alt"></i> Đăng nhập</a></li>
            <li><a href="/pages/register.html" class="btn btn-primary btn-sm"><i class="fas fa-user-plus"></i> Đăng ký</a></li>
        `;
    }

    // Đánh dấu active link
    const currentPath = window.location.pathname;
    navLinks.querySelectorAll('a').forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
}

// Xóa bỏ triệt để nút menu thừa nếu trình duyệt còn lưu cache HTML cũ
document.addEventListener('DOMContentLoaded', () => {
    updateNav();

    const strayButtons = document.querySelectorAll('.menu-toggle, nav button');
    strayButtons.forEach(btn => {
        if (btn.classList.contains('menu-toggle') || btn.querySelector('.fa-bars') || btn.innerHTML.includes('fa-bars')) {
            btn.remove();
        }
    });
});

window.Auth = Auth;
window.showToast = showToast;
window.updateNav = updateNav;

