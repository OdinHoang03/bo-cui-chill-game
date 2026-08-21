# Model vũ khí (.glb)

Game tải model vũ khí từ thư mục này. Đặt đúng **tên file** như dưới đây thì game tự dùng;
nếu thiếu file nào, vũ khí đó tự hiển thị **rìu dự phòng** (tô màu theo vũ khí) nên game
không bao giờ vỡ.

| File cần đặt vào đây | Vũ khí trong game | Kỹ năng |
|---|---|---|
| `weapons/hammer.glb` | 🔨 Búa Chấn Địa | 💥 Chấn Địa |
| `weapons/sword.glb`  | ⚔️ Kiếm Gió | 💨 Lao Vút |
| `weapons/dual.glb`   | 🗡️ Song Đao | 🌪️ Liên Trảm |
| `weapons/spear.glb`  | 🔱 Thương Xuyên Kích | ➹ Xuyên Kích |

(Rìu mặc định dùng `../lava_axe.glb` sẵn có.)

## Cách tải model từ Sketchfab

1. Vào https://sketchfab.com/tags/axe (hoặc search "hammer", "sword", "spear", "dual dagger").
2. Lọc **Downloadable** và ưu tiên giấy phép **CC0 / CC-BY** (nhớ ghi credit tác giả nếu là CC-BY).
3. Bấm **Download 3D Model → chọn định dạng glTF (.glb)**. File `.glb` gói sẵn texture, dùng ngay.
4. Đổi tên file thành đúng tên ở bảng trên rồi copy vào thư mục `weapons/` này.
5. Commit + push để GitHub Pages phục vụ file. Hard-refresh (Ctrl+F5) trong game.

## Lưu ý kỹ thuật

- Game **tự xoay & tự chỉnh tỉ lệ** mọi model (hàm `buildWeaponHolder`): cán dài → dọc, đầu nặng → chúc xuống,
  lưỡi → hướng ra trước, scale về chiều dài chuẩn ~1.05m. Không cần chỉnh model thủ công.
- Nếu một vũ khí cầm bị **ngược đầu/ngược lưỡi**, có thể do model quá bất đối xứng — báo lại để chỉnh `AXE_EXTRA_YAW`.
- Ưu tiên model **low-poly** (< vài nghìn tam giác) để game chạy mượt khi phòng đông.
- Chỉ chấp nhận `.glb`. Nếu chỉ có `.gltf + thư mục texture` hoặc `.fbx/.obj`, cần convert sang `.glb` trước
  (ví dụ dùng https://gltf.report hoặc Blender export glb).
