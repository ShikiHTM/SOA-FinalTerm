# LMS Frontend

Ứng dụng giao diện LMS sử dụng React, TypeScript và Vite.

## Trạng thái

- Chạy với dữ liệu mock; chưa tích hợp API Gateway hoặc xác thực thật.
- Mock chỉ sử dụng tạm thời; sau khi các service và Gateway giao tiếp đầy đủ, được kiểm thử tích hợp thành công thì loại bỏ toàn bộ mock và chế độ thử vai trò.

## Khởi chạy

Tại thư mục gốc repository:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @soa-final-term/frontend dev
```

Truy cập `http://localhost:5173`. Nguồn dữ liệu mặc định là `mock`; cấu hình mẫu nằm tại `.env.example`.

### Nguồn dữ liệu

Tạo `applications/frontend/.env.local` từ `.env.example` và chọn `VITE_DATA_SOURCE=mock` để dùng adapter mock. Sau khi adapter Gateway hoàn chỉnh, đặt `VITE_DATA_SOURCE=api` và `VITE_API_BASE_URL` theo địa chỉ Gateway của nhóm; khởi động lại Vite sau khi thay đổi. Các biến `VITE_` được đưa vào frontend, không chứa secret.

Hiện chế độ `api` chỉ kiểm tra cấu hình và báo chưa hoàn thiện; không tự chuyển sang mock. Cần tích hợp adapter, xác thực, phiên và dữ liệu theo contract trước khi bật API. Các interface và `read()` tổng hợp hiện tại có thể cần điều chỉnh nếu contract thực tế khác.

| Tài khoản mock | Vai trò |
| --- | --- |
| `user@lms.local` | User / Member |
| `owner@lms.local` | Group Owner |
| `moderator@lms.local` | Group Moderator |
| `admin@lms.local` | System Admin |
| `rbac@lms.local` | Thử chuyển đổi vai trò |

Mật khẩu mock: `demo123`. Với tài khoản `rbac`, vai trò nhóm áp dụng cho nhóm **Cơ sở dữ liệu** và dữ liệu thử được tách theo tab. Không nhập mật khẩu thật.

## Kiểm tra

```powershell
pnpm --filter @soa-final-term/frontend lint
pnpm --filter @soa-final-term/frontend typecheck
pnpm --filter @soa-final-term/frontend test
pnpm --filter @soa-final-term/frontend build
```

## Cấu trúc

| Đường dẫn | Trách nhiệm |
| --- | --- |
| `src/app/`, `src/App.tsx` | Giao diện chung, phiên và định tuyến |
| `src/features/` | Các màn hình theo nghiệp vụ |
| `src/authorization/` | Quy tắc phân quyền frontend |
| `src/data/contracts/` | Hợp đồng dữ liệu nội bộ frontend |
| `src/data/mock/` | Dữ liệu và thao tác mô phỏng |
| `src/data/selectServices.ts` | Chọn adapter theo cấu hình môi trường |
| `src/data/http/` | HTTP client cơ bản cho adapter API tương lai |
| `src/data/gateway/` | Khung ghép adapter và mẫu Notification; chưa kết nối Gateway |

Các interface trong `data/contracts/` phản ánh nhu cầu frontend. Khi tích hợp, triển khai adapter cho từng nghiệp vụ theo OpenAPI đã xác nhận, cung cấp xác thực và session, rồi ghép qua `createGatewayServices`. `createNotificationAdapter` nhận cấu hình request từ bên ngoài; chưa quy định route Gateway. Chế độ `api` hiện vẫn bị chặn cho đến khi tích hợp hoàn chỉnh.

