/* Dữ liệu MẪU cho chế độ ?demo=1 — không phải số liệu thật, chỉ để xem giao diện */
window.VHXK_DEMO = function (now) {
  const H = 3600e3, t = (h) => new Date(+now + h * H).toISOString();
  const inc = [
    { incident_id: 'DEMO-SW-310826__LICH_TAU', level: 'RED', category: 'LICH_TAU', contract_lot: 'AAN-SW.310826 LOT 5', customer: 'SUREWAVE (DEMO)', vessel_booking: 'ONE WREN 031E → ONE CONTINUITY', etd: t(140), deadline: t(18.7), deadline_label: 'HẠN', fact: 'Hãng tàu thông báo đổi feeder, ETD dời sang 26/10.', sender: 'ops@line.example', received_at: t(-3.5), ai_assessment: 'Chậm tàu có thể vượt Last Shipment Date trên L/C; cần tu chỉnh trước khi trình bộ chứng từ.', action: 'Báo Sales xin khách tu chỉnh L/C shipment date; xác nhận lại slot và container rỗng.', pic: 'Quỳnh Trang', unanswered_hours: 26, amount_usd: 350, first_seen_scan: 'DEMO-S6' },
    { incident_id: 'DEMO-AGI-080926__CHUNG_THU', level: 'RED', category: 'CHUNG_THU', contract_lot: 'TL-AGI-080926 LOT 1', customer: 'AGRICO (DEMO)', deadline: t(3.9), deadline_label: 'HẠN', fact: 'Giám định từ chối cấp Health Certificate theo mẫu khách yêu cầu.', sender: 'cert@inspection.example', received_at: t(-6), ai_assessment: 'Nếu không có văn bản chấp nhận thay thế, bộ chứng từ có rủi ro bị từ chối thanh toán.', action: 'Gửi công văn mẫu đề nghị khách chấp nhận "Fit for Human Consumption" trước 18:00.', pic: 'Hoà An', needs_verification: true, first_seen_scan: 'DEMO-S5' },
    { incident_id: 'DEMO-EMR-260826__DEM_DET', level: 'RED', category: 'DEM_DET', contract_lot: 'AAN-EMR-260826', customer: '77 EMERALD (DEMO)', deadline: t(320), deadline_label: 'FREE TIME', fact: 'Hàng đã đến POD, consignee chưa làm thủ tục nhận D/O.', sender: 'agent@pod.example', received_at: t(-28), ai_assessment: 'Sau free time phát sinh DEM/DET theo ngày; khách có thể bỏ hàng nếu giá nội địa giảm.', action: 'Liên hệ khách xin lịch trình thông quan, yêu cầu nộp D/O trước 25/10.', pic: 'Khiết', amount_usd: 124000, first_seen_scan: 'DEMO-S1' },
    { incident_id: 'DEMO-PRO-090426__THANH_TOAN', level: 'RED', category: 'THANH_TOAN', contract_lot: 'PROMENTER 090426', customer: 'PROMENTER (DEMO)', deadline: t(-120), deadline_label: 'HẠN TT', fact: 'Khách hẹn thanh toán nhưng chưa gửi SWIFT, đã nhắc lần 3.', sender: 'finance@buyer.example', received_at: t(-50), ai_assessment: 'Giữ bộ B/L gốc tại công ty cho tới khi tiền về; không phát hành Telex Release.', action: 'Không phát hành Telex Release; kế toán gọi CFO đối tác theo kịch bản nhắc nợ 2.', pic: 'Nguyễn Võ', amount_usd: 84200, first_seen_scan: 'DEMO-S1' },
    { incident_id: 'DEMO-LDC-P004523__SI_VGM', level: 'AMBER', category: 'SI_VGM', contract_lot: 'LDC P004523', customer: 'LDC (DEMO)', cutoff: t(22), fact: 'Hãng tàu nhắc nộp SI và VGM cho 20 cont trước cut-off.', sender: 'docs@carrier.example', received_at: t(-1.2), ai_assessment: 'Kho đã đóng đủ; chỉ cần đối chiếu số seal/cont.', action: 'Đối chiếu packing list và submit SI trên portal hãng tàu trước 17:00.', pic: 'Quỳnh Trang', first_seen_scan: 'DEMO-S7', status: 'ACK' },
    { incident_id: 'DEMO-ITO-S0047__LC', level: 'AMBER', category: 'LC', contract_lot: 'ITOCHU S0047', customer: 'ITOCHU (DEMO)', deadline: t(44), deadline_label: 'PHẢN HỒI', fact: 'Draft L/C sửa lần 3 vẫn còn điều khoản chứng thư khó đáp ứng ở 46A.', sender: 'trade@bank.example', received_at: t(-2.5), action: 'Gọi khách xác nhận chứng thư kép hoặc tu chỉnh trước khi phát hành.', pic: 'Hoà An', first_seen_scan: 'DEMO-S6' }
  ];
  const scans = []; const o = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Saigon', hour: '2-digit', hour12: false }).format(now);
  const curH = Math.min(19, +o); const base = new Date(+now - (+o) * H - (now.getUTCMinutes() * 60e3));
  const pattern = [[0, 0, 4], [0, 0, 6], [1, 1, 9], [2, 1, 7], [1, 2, 12], [1, 1, 8], [1, 1, 23], [0, 1, 5], [0, 0, 6], [0, 0, 4], [0, 0, 3], [0, 0, 2], [0, 0, 1]];
  let or = 0, oa = 0;
  for (let h = 7, k = 0; h <= Math.max(7, curH); h++, k++) {
    const p = pattern[k % pattern.length]; or = Math.min(4, or + p[0]); oa = Math.min(2, oa + p[1]);
    scans.push({ scan_id: 'DEMO-S' + (k + 1), scan_time: new Date(+base + h * H + 4 * 60e3).toISOString(), status: 'OK', emails_scanned: p[2], new_red: p[0], new_amber: p[1], normal_skipped: Math.max(0, p[2] - p[0] - p[1]), open_red: or, open_amber: oa, message: '' });
  }
  const last = scans[scans.length - 1].scan_id;
  inc[1].first_seen_scan = last;
  const emails = inc.map((i) => ({ scan_id: i.first_seen_scan === last ? last : scans[Math.max(0, scans.length - 2)].scan_id, contract_lot: i.contract_lot, subject: i.fact.slice(0, 60), sender: i.sender, classification: i.level }));
  const pics = [
    { pic: 'Quỳnh Trang', initials: 'QT', role: 'Admin XK', scope: 'Booking, SI/VGM' }, { pic: 'Hoà An', initials: 'HA', role: 'Admin XK', scope: 'Chứng từ, L/C' },
    { pic: 'Khiết', initials: 'KH', role: 'Admin XK', scope: 'Hiện trường, POD' }, { pic: 'Nguyễn Võ', initials: 'NV', role: 'Admin XK', scope: 'Hợp đồng, thanh toán' },
    { pic: 'Sales', initials: 'SL', role: 'Kinh doanh' }, { pic: 'Kế toán', initials: 'KT', role: 'Tài chính' }
  ];
  return { ok: true, generated_at: now.toISOString(), incidents: inc, scans, emails, pics };
};
