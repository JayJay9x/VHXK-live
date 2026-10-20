/* VHXK LIVE WAR ROOM – cấu hình hệ thống (không chứa khoá truy cập) */
window.VHXK_CONFIG = {
  API_BASE: 'https://mekongfishmeal.com/webhook/vhxk-live',   // n8n: /data (GET) · /action (POST)
  REFRESH_MS: 60000,                                          // tần suất nạp lại dữ liệu
  SCAN_HOURS: [7, 19],                                        // lịch quét Outlook: 07:00 → 19:00
  SCAN_DAYS: [1, 2, 3, 4, 5, 6],                              // Thứ 2 → Thứ 7
  STALE_AFTER_MIN: 90,                                        // quá 90' không có lượt quét trong giờ làm việc = dữ liệu cũ
  TZ: 'Asia/Saigon',
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/1Az8JBzRFOR3xOkyQLaDjpsot_B5ZRsDiB1Qfr3_KUcg/edit',
  OWNER_EMAIL: 'hoadt@aan.vn'
};
