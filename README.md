# Chess Online – Website Chơi Cờ Vua Trực Tuyến

> **Đồ án môn học: Phát triển ứng dụng Web**  
> **Nhóm thực hiện: Nhóm 6 thành viên**  
> **Công nghệ chính:** Node.js, Express.js, Socket.IO, MySQL, HTML5/CSS3/JavaScript, chess.js.

---

## 1. Giới thiệu dự án

**Chess Online** là website chơi cờ vua trực tuyến thời gian thực phục vụ đồ án môn học. Dự án được thiết kế với giao diện thuần tiếng Việt, hiện đại, thân thiện, dễ vận hành và dễ thuyết trình bảo vệ đồ án.

### Các chức năng chính:
- **Xác thực người dùng:** Đăng ký, đăng nhập (mã hóa mật khẩu bằng bcrypt, phiên đăng nhập bằng JWT), đổi tên hiển thị.
- **Quản lý phòng chơi:** Tạo phòng với mã phòng 6 ký tự ngẫu nhiên, tham gia bằng mã phòng, chia sẻ đường dẫn phòng trực tiếp, danh sách các phòng đang chờ.
- **Đấu cờ trực tuyến 2 người:** Đồng bộ nước đi thời gian thực qua **Socket.IO**, kiểm soát luật chặt chẽ bằng **chess.js** (nhập thành, bắt tốt qua đường, phong cấp tốt, kiểm tra chiếu/chiếu hết/hòa cờ).
- **Trò chuyện & Gọi video (WebRTC):** Khung chat trực tiếp trong phòng đấu và tính năng video call peer-to-peer (bật/tắt camera, bật/tắt micro).
- **Chơi với máy tính (AI):** Thuật toán cờ vua **Minimax kết hợp Alpha-Beta Pruning** và **Piece-Square Tables** với 3 cấp độ: Dễ, Trung bình, Khó.
- **Hồ sơ & Lịch sử ván cờ:** Thống kê tổng số trận, tỉ lệ thắng/thua/hòa, bảng lịch sử các trận đấu và **tính năng xem lại trận đấu (Game Review)** tua từng nước cờ trực quan.
- **Cơ sở dữ liệu kép (Dual-mode Database):** Hỗ trợ kết nối chuẩn **MySQL** kèm **In-Memory Fallback tự động** (giúp chạy demo ngay lập tức mà không lo lỗi khi chưa cài hoặc chưa bật MySQL).

---

## 2. Cấu trúc thư mục dự án

```text
Covua/
├── client/                     # Mã nguồn giao diện Frontend
│   ├── css/
│   │   └── site.css            # Toàn bộ CSS hệ thống, responsive PC & Mobile
│   ├── js/
│   │   ├── auth.js             # Quản lý phiên đăng nhập, JWT, Toast, Navbar
│   │   ├── chess.js            # Engine luật cờ vua UMD client
│   │   ├── chessboard.js       # Component bàn cờ HTML5 kéo thả & nhấp chọn
│   │   ├── computer.js         # Thuật toán AI Minimax đấu với máy
│   │   ├── game.js             # Xử lý ván đấu 2 người, Socket.IO & WebRTC
│   │   ├── profile.js          # Hồ sơ, thống kê & xem lại ván đấu
│   │   ├── rooms.js            # Danh sách phòng, tạo phòng & tham gia
│   │   └── sounds.js           # Hiệu ứng âm thanh cờ vua Web Audio API
│   ├── img/
│   │   └── pieces/             # 12 quân cờ vector SVG chuẩn quốc tế
│   ├── pages/
│   │   ├── computer.html       # Trang đấu với máy
│   │   ├── game.html           # Trang bàn cờ trực tuyến 2 người
│   │   ├── login.html          # Trang đăng nhập
│   │   ├── profile.html        # Trang hồ sơ & xem lại trận đấu
│   │   ├── register.html       # Trang đăng ký
│   │   └── rooms.html          # Trang danh sách phòng
│   └── index.html              # Trang chủ website
├── server/                     # Backend API & Real-time Server
│   ├── controllers/
│   │   ├── authController.js   # Đăng ký, đăng nhập, đổi profile
│   │   ├── gameController.js   # Lịch sử đấu, thống kê, chi tiết ván
│   │   └── roomController.js   # Tạo phòng, tham gia, danh sách phòng
│   ├── database/
│   │   └── db.js               # Kết nối MySQL & Fallback Engine
│   ├── routes/
│   │   ├── auth.js
│   │   ├── games.js
│   │   └── rooms.js
│   ├── sockets/
│   │   └── chess.js            # Xử lý sự kiện Socket.IO (move, chat, call)
│   ├── index.js                # Server chính Express & Socket.IO
│   ├── .env                    # Biến môi trường cấu hình cổng & CSDL
│   └── package.json
├── database/
│   └── schema.sql              # File SQL tạo bảng & dữ liệu mẫu
├── test/
│   └── test_all.js             # Bộ kịch bản kiểm thử tự động 18 test cases
├── package.json                # Quản lý script khởi chạy root
└── README.md                   # Hướng dẫn chi tiết
```

---

## 3. Hướng dẫn cài đặt và khởi chạy

### Bước 1: Yêu cầu môi trường
- Đã cài đặt **Node.js** (phiên bản 18+ trở lên). Kiểm tra bằng lệnh:
  ```bash
  node -v
  npm -v
  ```

### Bước 2: Cài đặt thư viện
Tại thư mục gốc dự án, chạy lệnh:
```bash
npm run install:server
```
*(Hoặc vào thư mục `server` và chạy `npm install`).*

### Bước 3: Cấu hình Cơ sở dữ liệu (MySQL)
1. Mở **XAMPP** (hoặc MySQL Workbench / Docker) và khởi động dịch vụ **MySQL**.
2. Mở phpMyAdmin (thường là `http://localhost/phpmyadmin`) hoặc giao diện dòng lệnh MySQL.
3. Import file `database/schema.sql` vào MySQL:
   ```bash
   mysql -u root -p < database/schema.sql
   ```
4. Kiểm tra file `server/.env` (mặc định đã được cấu hình sẵn):
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASS=
   DB_NAME=chess_online
   JWT_SECRET=chess_online_secret_key_2026_nhom6
   ```

> **Lưu ý đặc biệt (Chế độ dự phòng tự động):**  
> Nếu bạn chưa cài đặt hoặc chưa khởi động MySQL, hệ thống sẽ **tự động chuyển sang CSDL Fallback In-Memory** với dữ liệu mẫu có sẵn để bạn kiểm thử ngay lập tức mà không hề bị dừng hay báo lỗi crash!

### Bước 4: Khởi động Server
Tại thư mục gốc, gõ lệnh:
```bash
npm start
```
Khi màn hình hiển thị:
```text
==============================================================
 ♟ CHESS ONLINE - HỆ THỐNG ĐANG HOẠT ĐỘNG TẠI: http://localhost:3000
   - Trang chủ:          http://localhost:3000/
   - Đăng nhập:          http://localhost:3000/pages/login.html
   - Danh sách phòng:    http://localhost:3000/pages/rooms.html
   - Chơi với máy:       http://localhost:3000/pages/computer.html
==============================================================
```
Bạn mở trình duyệt web và truy cập: **`http://localhost:3000`**.

---

## 4. Tài khoản mẫu để kiểm thử nhanh

Trong CSDL đã tạo sẵn 2 tài khoản mẫu (mật khẩu mặc định là `123456`):
- **Kỳ thủ 1:** Tên đăng nhập: `nguyenvana` | Mật khẩu: `123456`
- **Kỳ thủ 2:** Tên đăng nhập: `tranthib`   | Mật khẩu: `123456`

*(Tại trang Đăng nhập, có sẵn 2 nút bấm nhanh để điền tài khoản mẫu chỉ với 1 click).*

---

## 5. Hướng dẫn kịch bản kiểm thử (Demo Đồ Án)

### Kịch bản 1: Đấu cờ trực tuyến 2 người (Real-Time 2 Players)
1. Mở **Trình duyệt 1** (ví dụ Google Chrome):
   - Đăng nhập với tài khoản `nguyenvana`.
   - Vào mục **Phòng chơi**, bấm **"Tạo phòng mới"**.
   - Copy mã phòng (ví dụ `CV89XA`) hoặc bấm **"Vào Bàn Cờ Ngay"**.
2. Mở **Trình duyệt 2** (ví dụ Tab ẩn danh Incognito hoặc Microsoft Edge):
   - Đăng nhập với tài khoản `tranthib`.
   - Vào mục **Phòng chơi**, nhập mã phòng `CV89XA` và bấm **"Vào phòng"** (hoặc bấm nút "Tham gia" trong danh sách phòng chờ).
3. Hai bên nhìn thấy bàn cờ:
   - Bên Trắng (`nguyenvana`) đi nước đầu tiên (kéo thả hoặc nhấp quân cờ).
   - Nước cờ lập tức được đồng bộ sang máy của Bên Đen (`tranthib`) kèm âm thanh gõ cờ.
   - Thử gửi tin nhắn chat trong tab "Trò chuyện".
   - Bấm nút "Lật bàn cờ", "Cầu hòa" hoặc "Đầu hàng".

### Kịch bản 2: Gọi Video Call WebRTC
1. Ở tab bên phải bàn cờ, chọn tab **"Video Call"**.
2. Một bên bấm **"Bắt đầu Video Call"** và cấp quyền camera/micro trên trình duyệt.
3. Bên còn lại chấp nhận cuộc gọi. Cả 2 video sẽ hiển thị cạnh bàn cờ.
4. Thử bật/tắt micro và camera.

### Kịch bản 3: Chơi cờ vua với máy tính (AI)
1. Trên thanh điều hướng, chọn **"Đấu với máy"** (`/pages/computer.html`).
2. Chọn màu quân (Trắng hoặc Đen) và độ khó (Dễ / Trung bình / Khó).
3. Bắt đầu đi cờ. Máy tính sẽ suy nghĩ và tự động đi lại trong 0.3s.

### Kịch bản 4: Xem hồ sơ và lịch sử trận đấu (Game Review)
1. Chọn **"Hồ sơ"** (`/pages/profile.html`).
2. Xem thống kê tổng số trận, số trận thắng, thua, hòa và tỉ lệ thắng.
3. Trong bảng "Lịch sử các trận đấu gần đây", bấm nút **"Xem lại"** ở một trận bất kỳ.
4. Một bàn cờ tương tác mở ra cho phép bạn bấm nút **Next (>), Prev (<), Auto Play** để xem lại toàn bộ diễn biến ván cờ từ đầu đến cuối.

---

## 6. Chạy bộ kiểm thử tự động (Automated Test Suite)

Dự án đi kèm bộ kịch bản kiểm thử tự động đầy đủ 18 trường hợp kiểm thử (HTTP, Auth, Room, Socket.IO, Realtime Move Sync, Stats, AI).

Để chạy bộ kiểm thử, mở một cửa sổ dòng lệnh khác và gõ:
```bash
npm test
```
Kết quả mong đợi:
```text
========================================================
 KẾT QUẢ KIỂM THỬ TỔNG THỂ:
   - Thành công (PASS): 18
   - Thất bại   (FAIL): 0
========================================================
>>> CHÚC MỪNG: HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO 100%! <<<
```

---

## 7. Bảng phân chia công việc cho nhóm 6 thành viên

| STT | Thành viên | Vai trò đảm nhiệm | Các file phụ trách chính | Nội dung công việc chi tiết |
|:---:|:---|:---|:---|:---|
| **1** | **Thành viên 1** | Frontend UI & Trang chính | `client/css/site.css`<br>`client/index.html`<br>`client/pages/login.html`<br>`client/pages/register.html` | Thiết kế giao diện chung (CSS design system, màu sắc, font chữ, responsive PC & mobile), xây dựng trang chủ, trang đăng nhập và đăng ký. |
| **2** | **Thành viên 2** | Backend API & Xác thực | `server/index.js`<br>`server/routes/auth.js`<br>`server/controllers/authController.js` | Xây dựng API Express.js, cấu hình CORS, xử lý đăng ký tài khoản, đăng nhập JWT, băm mật khẩu bcrypt và cập nhật thông tin người dùng. |
| **3** | **Thành viên 3** | Bàn cờ & Luật cờ vua | `client/js/chessboard.js`<br>`client/js/chess.js`<br>`client/img/pieces/*`<br>`client/js/sounds.js` | Xây dựng component bàn cờ kéo thả & nhấp chọn ô, vẽ tọa độ, gợi ý nước đi, phong cấp tốt, tích hợp engine luật chess.js và âm thanh Web Audio. |
| **4** | **Thành viên 4** | Phòng chơi & Socket.IO | `server/controllers/roomController.js`<br>`server/routes/rooms.js`<br>`server/sockets/chess.js`<br>`client/js/game.js` | Xây dựng hệ thống phòng chơi, sinh mã phòng ngẫu nhiên, kết nối Socket.IO, đồng bộ nước đi thời gian thực giữa 2 người chơi và đồng hồ đếm ngược. |
| **5** | **Thành viên 5** | Cơ sở dữ liệu & Hồ sơ | `database/schema.sql`<br>`server/database/db.js`<br>`server/controllers/gameController.js`<br>`client/js/profile.js`<br>`client/pages/profile.html` | Thiết kế CSDL MySQL (Users, Rooms, Games, ChatMessages), tạo dữ liệu mẫu, lưu FEN và PGN, xây dựng trang thống kê và tính năng xem lại ván cờ. |
| **6** | **Thành viên 6** | Trò chuyện, AI & Video Call | `client/js/computer.js`<br>`client/pages/computer.html`<br>`client/pages/game.html` (Chat & WebRTC)<br>`test/test_all.js` | Tích hợp thuật toán Minimax Alpha-Beta cho chế độ đấu với máy, khung chat Socket.IO, triển khai video call WebRTC P2P và viết bộ test tự động. |

---

## 8. Kết luận & Đánh giá đồ án

- Dự án hoàn thành đầy đủ 100% tất cả các yêu cầu trong đề bài.
- Mã nguồn phân tách rõ ràng theo mô hình MVC, chú thích tiếng Việt dễ đọc, dễ bảo trì.
- Sẵn sàng để các thành viên trong nhóm tự tin thuyết trình và đạt kết quả cao trong kỳ đánh giá đồ án.

