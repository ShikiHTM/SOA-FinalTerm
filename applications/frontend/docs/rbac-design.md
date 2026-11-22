# Bảng phân quyền RBAC

**✓** Được phép · **ĐK** Có điều kiện · **—** Không áp dụng · **?** Cần nhóm xác nhận.

Member, Moderator và Owner là vai trò trong **nhóm đang xét** và đồng thời có quyền cơ bản của User. System Admin là vai trò hệ thống riêng. Bảng này là đề xuất để nhóm thống nhất, chưa khẳng định backend đã hỗ trợ.

| UC | Chức năng | Guest | User | Member | Moderator | Owner | System Admin | Điều kiện |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Đăng nhập | ✓ | — | — | — | — | — | Theo contract xác thực. |
| 02 | Đăng ký | ✓ | — | — | — | — | — | Theo quy định đăng ký. |
| 03 | Xem danh sách nhóm | ✓ | ✓ | ✓ | ✓ | ✓ | ? | Thông tin nhóm riêng tư Guest được xem cần xác nhận. |
| 04 | Xem hồ sơ User | ✓ | ✓ | ✓ | ✓ | ✓ | ? | Những trường công khai cần xác nhận. |
| 05 | Xem kỳ thi công khai | ✓ | ✓ | ✓ | ✓ | ✓ | ? | Phạm vi thông tin và câu hỏi được xem cần xác nhận. |
| 06 | Quản lý hồ sơ | — | ĐK | ĐK | ĐK | ĐK | ? | User quản lý hồ sơ của chính mình. |
| 07 | Tham gia nhóm | — | ĐK | ĐK | ĐK | ĐK | ? | Chưa là thành viên của nhóm muốn tham gia; theo chính sách nhóm. |
| 08 | Tham gia kỳ thi | — | ĐK | ĐK | ĐK | ĐK | ? | Kỳ thi công khai theo điều kiện kỳ thi; kỳ thi riêng tư yêu cầu thành viên nhóm. |
| 09 | Nộp bài | — | ĐK | ĐK | ĐK | ĐK | ? | Có quyền tham gia, theo thời gian và số lượt cho phép. |
| 10 | Theo dõi User | — | ✓ | ✓ | ✓ | ✓ | ? | Điều kiện cụ thể cần xác nhận. |
| 11 | Quản lý đề yêu thích | — | ✓ | ✓ | ✓ | ✓ | ? | Phạm vi đề được lưu cần xác nhận. |
| 12 | Tạo nhóm | — | ✓ | ✓ | ✓ | ✓ | ? | User tạo nhóm là Owner của nhóm mới. |
| 13 | Quản lý thành viên nhóm | — | — | — | ✓ | ✓ | ? | Duyệt, xóa hoặc cấm trong nhóm; giới hạn trên từng vai trò cần xác nhận. |
| 14 | Quản lý đề trong nhóm | — | — | — | ✓ | ✓ | ĐK | Admin kiểm duyệt theo UC20. |
| 15 | Quản lý kỳ thi nhóm | — | — | — | ✓ | ✓ | ĐK | Admin kiểm duyệt theo UC19. |
| — | Chấm bài tự luận của nhóm | — | — | — | ✓ | ✓ | ? | Theo quyền nhóm và quy tắc chấm bài. |
| 16 | Quản lý cài đặt nhóm | — | — | — | — | ✓ | ĐK | Owner có quyền sửa cài đặt, bổ nhiệm/bãi nhiệm Moderator, chuyển quyền hoặc xóa nhóm; quyền Admin theo UC18 cần xác nhận. |
| 17 | Quản lý User toàn hệ thống | — | — | — | — | — | ✓ | Xem, đình chỉ, cấm hoặc quản lý tài khoản theo chính sách. |
| 18 | Quản lý mọi nhóm | — | — | — | — | — | ✓ | Theo dõi, kiểm duyệt hoặc xóa nhóm theo chính sách. |
| 19 | Kiểm duyệt kỳ thi | — | — | — | — | — | ✓ | Thao tác cụ thể cần xác nhận. |
| 20 | Kiểm duyệt đề | — | — | — | — | — | ✓ | Thao tác cụ thể cần xác nhận. |
