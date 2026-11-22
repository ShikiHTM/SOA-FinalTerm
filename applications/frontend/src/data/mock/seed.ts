import type { MockStore } from "./mockTypes";
import { MOCK_MODERATOR_EMAIL, MOCK_OWNER_EMAIL, MOCK_USER_EMAIL } from "./constants";

export function seed(): MockStore {
    const now: number = Date.now();
    return {
        groups: [
            {
                id: "web",
                name: "Lập trình Web",
                code: "WEB2026",
                description: "Cùng ôn tập và thực hành lập trình web.",
                visibility: "PUBLIC",
                role: "VISITOR",
                joinPolicy: "OPEN",
            },
            {
                id: "community",
                name: "Cộng đồng ôn tập",
                code: "CONGDONG",
                description: "Nhóm công khai dành cho mọi User.",
                visibility: "PUBLIC",
                role: "VISITOR",
                joinPolicy: "OPEN",
            },
            {
                id: "private",
                name: "Cơ sở dữ liệu",
                code: "DATA2026",
                description: "Nhóm riêng tư cần được phê duyệt.",
                visibility: "PRIVATE",
                role: "VISITOR",
                joinPolicy: "APPROVAL",
            },
            {
                id: "algo",
                name: "Thuật toán",
                code: "CODE2026",
                description: "Nhóm riêng tư dùng mật khẩu thử nghiệm demo1234.",
                visibility: "PRIVATE",
                role: "VISITOR",
                joinPolicy: "PASSWORD",
                password: "demo1234",
            },
        ],
        assessments: [
            {
                id: "web-exam",
                groupId: "web",
                title: "Kiến thức Web cơ bản",
                description: "Đề mẫu cho kỳ thi.",
                source: "DIRECT",
                practice: true,
                questions: [
                    {
                        id: "web-q1",
                        kind: "SINGLE",
                        text: "Phương thức HTTP thường dùng để lấy dữ liệu?",
                        points: 5,
                        options: ["GET", "POST", "DELETE"],
                        answers: ["0"],
                    },
                    {
                        id: "web-q2",
                        kind: "ESSAY",
                        text: "Giải thích vai trò của API Gateway.",
                        points: 5,
                        options: [],
                        answers: [],
                    },
                ],
            },
            {
                id: "community-exam",
                groupId: "community",
                title: "Nhập môn Microservices",
                description: "Đề công khai không cần tham gia nhóm.",
                source: "DIRECT",
                practice: true,
                questions: [
                    {
                        id: "community-q1",
                        kind: "SINGLE",
                        text: "API Gateway thường đảm nhận vai trò nào?",
                        points: 10,
                        options: ["Định tuyến request", "Thay thế cơ sở dữ liệu"],
                        answers: ["0"],
                    },
                ],
            },
            {
                id: "private-exam",
                groupId: "private",
                title: "Ôn tập cơ sở dữ liệu",
                description: "Đề mẫu trong nhóm riêng tư.",
                source: "DIRECT",
                practice: true,
                questions: [
                    {
                        id: "private-q1",
                        kind: "SINGLE",
                        text: "SQL thường được sử dụng để làm gì?",
                        points: 10,
                        options: ["Truy vấn dữ liệu", "Tạo giao diện"],
                        answers: ["0"],
                    },
                ],
            },
        ],
        contests: [
            {
                id: "web-contest",
                assessmentId: "web-exam",
                title: "Kiểm tra kiến thức Web",
                startAt: new Date(now - 3600000).toISOString(),
                endAt: new Date(now + 7 * 86400000).toISOString(),
                policy: "MULTIPLE",
            },
        ],
        submissions: [],
        notifications: [
            {
                id: "welcome-user",
                recipientEmail: MOCK_USER_EMAIL,
                title: "Chào mừng đến với LMS",
                body: "Bạn có thể tìm đề công khai và tham gia nhóm.",
                createdAt: new Date(now).toISOString(),
                read: false,
                href: "/groups",
            },
        ],
        memberships: {
            [MOCK_USER_EMAIL]: { web: "MEMBER" },
            [MOCK_OWNER_EMAIL]: { web: "OWNER", private: "OWNER" },
            [MOCK_MODERATOR_EMAIL]: { web: "MODERATOR" },
        },
        pending: { [MOCK_USER_EMAIL]: {}, [MOCK_OWNER_EMAIL]: {} },
    };
}
