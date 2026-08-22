# 🌲 Bổ Củi Chill Guy 3D 🪓

Game bổ củi 3D phong cách "chill guy" — chặt gỗ trong rừng với nhạc lo-fi thư giãn, kèm chế độ **chơi mạng PvP** (1v1 và phòng đông tối đa 8 người).

🎮 **Chơi ngay:** https://odinhoang03.github.io/bo-cui-chill-game/

## ✨ Tính năng

- 🪓 **9 kiểu bổ đa dạng**: bổ thẳng, bổ mạnh, bổ nhanh, chém xéo trái/phải, chém ngang, chém múc lên, bổ đôi tay, xoay người bổ.
- 🪵 **Khúc gỗ chi tiết**: texture vỏ cây / mặt cắt / thớ gỗ procedural, mắt gỗ, gờ vỏ. Mỗi khúc có số nhát bổ và kích thước khác nhau.
- 💥 **Vết chém chồng chéo**: mỗi nhát khắc một rãnh riêng, nứt lan dọc mạch, tách đôi đúng vị trí — mảnh gỗ chỉ văng khi bổ đôi.
- 🎥 **8 góc nhìn**: người thứ 3, qua vai, **góc nhìn thứ nhất**, trực diện, từ trên xuống, chéo trên cao, điện ảnh, tự do.
- ⚔️ **Chơi mạng PvP**: farm gỗ để nâng cấp sức mạnh, vừa bổ củi vừa đánh nhau. Có bảng xếp hạng, điều khiển cảm ứng cho điện thoại, link mời.
- 🎵 Nhạc nền lo-fi + tiếng gió, chim, hiệu ứng bổ — tất cả tạo bằng Web Audio API.
- 🌳 Rừng thông, cỏ, phấn hoa bay, đổ bóng động.

## 🕹️ Điều khiển

| Phím | Chức năng |
|------|-----------|
| Click / Space | Bổ củi / tấn công đối thủ |
| WASD | Di chuyển |
| Kéo chuột | Xoay góc nhìn |
| Q / 1–8 | Đổi góc nhìn (3 = góc nhìn thứ nhất) |
| 🎵 | Bật/tắt nhạc |

## 🌐 Chơi mạng: 2 cơ chế kết nối

Game hỗ trợ **hai kiểu mạng**, tự chọn qua biến `SERVER_URL` trong `index.html`:

1. **PeerJS P2P (mặc định)** — không cần server riêng, hai máy nối trực tiếp qua WebRTC. Đơn giản nhưng có thể **thất bại khi hai người khác mạng** (NAT/tường lửa chặt, 4G/5G).
2. **Server Cloudflare Worker (khuyên dùng cho nhiều mạng)** — mọi người nối WebSocket tới server trung chuyển. **Hết lỗi NAT**, phòng vẫn sống kể cả khi người tạo phòng thoát.

### 🚀 Deploy server Cloudflare (miễn phí)

Mã nguồn server nằm trong thư mục [`server/`](server/) (`worker.js` + `wrangler.toml`). Durable Objects có trong **gói Cloudflare Workers miễn phí** (đủ chơi với bạn bè).

```bash
# 1. Cài công cụ (một lần)
npm install -g wrangler

# 2. Đăng nhập Cloudflare
wrangler login

# 3. Vào thư mục server rồi deploy
cd server
wrangler deploy
```

Sau khi deploy, Wrangler in ra URL dạng:

```
https://bo-cui-chill-server.<tài-khoản>.workers.dev
```

Kiểm tra sống bằng cách mở URL đó trên trình duyệt — thấy chữ `Bo Cui Chill 3D server OK` là được.

> ⚠️ **Gói miễn phí:** `wrangler.toml` đã dùng `new_sqlite_classes` (Durable Object nền SQLite) đúng yêu cầu của gói free. Nếu Wrangler báo lỗi `code: 10097` đòi `new_sqlite_classes`, nghĩa là bạn đang dùng file cũ — hãy kéo bản mới nhất.

### 🔌 Cắm server vào game

Mở `index.html`, tìm dòng:

```js
let SERVER_URL='';
```

Đổi thành URL server của bạn nhưng **dùng `wss://`** (WebSocket bảo mật) thay cho `https://`:

```js
let SERVER_URL='wss://bo-cui-chill-server.<tài-khoản>.workers.dev';
```

Lưu, đẩy lên GitHub Pages là xong — từ đó mọi phòng sẽ đi qua server, người chơi khác mạng vào bình thường.

> 💡 **Test nhanh không cần sửa file:** thêm `?server=wss://...` vào URL game, ví dụ
> `https://odinhoang03.github.io/bo-cui-chill-game/?server=wss://bo-cui-chill-server.xxx.workers.dev`.
> URL server sẽ được nhớ trong trình duyệt (localStorage `bocuiServer`).

## 🛠️ Công nghệ

- [Three.js](https://threejs.org/) `v0.160.0` (WebGL, đổ bóng PCFSoft)
- Web Audio API (nhạc & hiệu ứng procedural)
- [PeerJS](https://peerjs.com/) (WebRTC P2P) + tuỳ chọn **Cloudflare Workers + Durable Objects** (server WebSocket)
- HTML/CSS/JS thuần, game gói trong một file `index.html` — không cần build

## 📜 Ghi công tài nguyên (Credits)

- **Skybox** "[Forest Clearing 1 Ground Skybox](https://sketchfab.com/3d-models/forest-clearing-1-ground-skybox-a78ae6a11957401a83fd074004aafcc0)" của **Luis Vidal** ([Sketchfab](https://sketchfab.com/Luis_Vidal)) — giấy phép [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/). File: `forest_clearing_1_ground_skybox.glb`.
- **Hào quang** "[Sonic Rangers Super Sonic Stomp Aura](https://sketchfab.com/3d-models/sonic-rangers-super-sonic-stomp-aura-c7803ade990740818729b057c6b4da44)" của **Accountnamed334** ([Sketchfab](https://sketchfab.com/Accountnamed334)) — giấy phép [CC-BY-4.0](http://creativecommons.org/licenses/by/4.0/). File: `sonic-rangers-super-sonic-stomp-aura.glb` (ngoại hình ✨ "Hào Quang Siêu Tốc").

---

⚡ **Tạo bởi DeepSeek Harness**
