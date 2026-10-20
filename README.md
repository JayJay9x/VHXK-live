# VHXK · LIVE WAR ROOM

Trung tâm điều hành trực tiếp của phòng Vận hành Xuất khẩu gạo (AAN Food JSC). Trang này hiển thị các việc 🔴/🟡 mà AI phát hiện khi quét hộp thư Outlook mỗi giờ, kèm PIC, hạn xử lý, đếm ngược, tải việc từng người và nhật ký quét.

Repo này **chỉ chứa bộ khung giao diện**. Không có dữ liệu kinh doanh nào nằm trong repo: dữ liệu được nạp lúc chạy từ Google Sheet thông qua n8n và cần khoá truy cập.

## Luồng dữ liệu

```
Outlook (hoadt@aan.vn)
   │  lịch "Check email Outlook hàng giờ" (07:00–19:00, T2–T7)
   ▼
Claude đọc email → chấm 🔴/🟡 → POST JSON
   ▼
n8n  /webhook/vhxk-live/ingest   ──►  Google Sheet "VHXK · LIVE WAR ROOM DB"
                                         Incidents · EmailLog · ScanLog · PIC · ActionLog
   ▲                                     │
   │ POST /webhook/vhxk-live/action      │ GET /webhook/vhxk-live/data?k=KEY
   │ (ĐÃ NHẬN / ĐÃ XỬ LÝ / HOÃN)         ▼
   └──────────────  Dashboard GitHub Pages (repo này), tự làm mới mỗi 60 giây
```

* **Single source of truth:** Google Sheet. Sửa trực tiếp trên Sheet (ví dụ đổi PIC, đóng việc) thì dashboard cập nhật ở lần làm mới kế tiếp.
* **Chống trùng:** mỗi sự việc có `incident_id` (mặc định = `MÃ_HĐ/LÔ__DANH_MỤC`). Lượt quét sau gặp lại cùng sự việc thì n8n cập nhật dòng cũ, tăng `seen_count`; nếu việc đã `DONE` mà lại xuất hiện thì tự mở lại.

## Mở dashboard

* Lần đầu: mở `https://jayjay9x.github.io/VHXK-live/` rồi nhập khoá truy cập (lưu trong trình duyệt này).
* Link mở thẳng không cần nhập: `https://jayjay9x.github.io/VHXK-live/#k=<KHOÁ>`. Khoá được lưu rồi xoá khỏi thanh địa chỉ.
* Xem bằng dữ liệu mẫu: `?demo=1`
* Màn hình treo tường: `?mode=tv` (hoặc bấm **TV** trên thanh điều hướng)
* Việc của riêng một PIC (dùng trên điện thoại): `?pic=Quỳnh%20Trang`

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Khung trang |
| `assets/style.css` | Skin RICE-CORE OPS (đồng bộ với VHXK-report) |
| `assets/app.js` | Nạp dữ liệu, hiển thị, chuyển động, nút thao tác |
| `config.js` | Địa chỉ API n8n, giờ quét, ngưỡng "dữ liệu cũ" |
| `data/demo.js` | Dữ liệu mẫu cho `?demo=1` |

## Hợp đồng dữ liệu (POST `/ingest`)

```json
{
  "key": "<KHOÁ>",
  "scan": { "scan_id": "SCAN-202610201400", "scan_time": "2026-10-20T14:04:00+07:00",
            "status": "OK | NO_NEW | LOGIN_REQUIRED | OFFLINE | ERROR",
            "window_from": "...", "window_to": "...", "emails_scanned": 23, "normal_skipped": 19, "message": "" },
  "incidents": [{
     "incident_id": "AAN-SW-310826-LOT-5__LICH_TAU", "level": "RED | AMBER",
     "category": "BOOKING | SI_VGM | CONTAINER | LICH_TAU | CHUNG_TU | CHUNG_THU | LC | DEM_DET | THANH_TOAN | KHACH_HANG | CHI_PHI | KHAC",
     "contract_lot": "...", "customer": "...", "vessel_booking": "...", "etd": "ISO", "cutoff": "ISO",
     "deadline": "ISO", "deadline_label": "HẠN / CUT-OFF SI / FREE TIME…", "amount_usd": 0,
     "fact": "sự việc trích từ email", "sender": "...", "sender_email": "...", "received_at": "ISO",
     "ai_assessment": "nhận định của AI", "action": "việc cần làm", "pic": "Tên PIC", "pic_role": "...",
     "needs_verification": false, "unanswered_hours": 0, "email_subject": "...", "email_link": "...", "attachments": "..."
  }],
  "emails": [{ "received_at": "ISO", "sender": "...", "sender_email": "...", "to_cc": "...", "subject": "...", "folder": "Ưu tiên | Khác",
               "contract_lot": "...", "customer": "...", "classification": "RED | AMBER | NORMAL", "category": "...", "summary": "...",
               "has_attachments": true, "incident_id": "..." }]
}
```

## Chuyển động

Ngôn ngữ chuyển động chuyển thể từ thư viện phim Lemo-Opuscar (Hologram HUD, Satellite Briefing, Briefing Board, Data Storytelling):

* **Scan sweep**: mỗi lượt quét mới, một dải sáng quét qua màn hình rồi số liệu in lại.
* **Target lock**: việc 🔴 mới bị khung ngắm khoá vào thẻ, nháy trắng 3 khung hình.
* **Rolling digits**: số KPI cuộn ký tự rồi khoá từ phải sang trái.
* **Leader lines**: rê chuột vào một thẻ thì có đường dẫn tới PIC và mốc trên dòng thời gian 72h.
* **Deadline drain**: thanh thời gian còn lại cạn dần; dưới 2h thẻ có viền chạy; quá hạn thì nháy lỗi một lần.
* **Magnets + stamp**: tải việc PIC là các "nam châm" rơi vào; bấm ĐÃ XỬ LÝ thì đóng dấu rồi thu gọn thẻ.
* **Ratchet gauge**: thanh báo động bật từng nấc; mức CAO trở lên thì viền màn hình thở đỏ.

Tôn trọng `prefers-reduced-motion`: khi người dùng tắt hiệu ứng trong hệ điều hành, mọi chuyển động thay bằng hiển thị tĩnh.
