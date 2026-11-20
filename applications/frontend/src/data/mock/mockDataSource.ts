import { MOCK_MODERATOR_EMAIL, MOCK_OWNER_EMAIL, MOCK_RBAC_EMAIL } from "./constants";
import { getPreviewRole, isMockSystemAdmin, PREVIEW_DATA_KEY, PREVIEW_GROUP_ID } from "./rolePreview";
import { canManageMember, hasGroupPermission, hasSystemPermission, type GroupPermission, type SystemRole } from "../../authorization/permissions";
import type { MockStore, RecipientNotice } from "./mockTypes";
import { seed } from "./seed";
import type { DataSource } from "../contracts/dataSource";
import type {
    Assessment,
    Contest,
    Group,
    GroupRole,
    GroupMember,
    JoinRequest,
    Snapshot,
    Submission,
} from "../../types";

const STORAGE_KEY: string = "lms-shared-mock-v3";



export function createMockDataSource(email: string): DataSource {
    const storageKey: string = email === MOCK_RBAC_EMAIL ? PREVIEW_DATA_KEY : STORAGE_KEY;
    const storage: Storage = email === MOCK_RBAC_EMAIL ? sessionStorage : localStorage;

    function synchronizePreviewRole(store: MockStore): void {
        if (email !== MOCK_RBAC_EMAIL) return;
        const role: string = getPreviewRole();
        if (store.previewRole === role) return;
        store.memberships[MOCK_RBAC_EMAIL] ??= {};
        store.memberships[MOCK_OWNER_EMAIL] ??= {};
        store.pending[MOCK_RBAC_EMAIL] ??= {};
        if (store.groups.some((group: Group): boolean => group.id === PREVIEW_GROUP_ID)) {
            store.memberships[MOCK_OWNER_EMAIL][PREVIEW_GROUP_ID] = role === "OWNER" ? "MEMBER" : "OWNER";
            if (role === "MEMBER" || role === "MODERATOR" || role === "OWNER") {
                store.memberships[MOCK_RBAC_EMAIL][PREVIEW_GROUP_ID] = role;
            } else {
                delete store.memberships[MOCK_RBAC_EMAIL][PREVIEW_GROUP_ID];
            }
            delete store.pending[MOCK_RBAC_EMAIL][PREVIEW_GROUP_ID];
            if (store.bans?.[PREVIEW_GROUP_ID]) {
                store.bans[PREVIEW_GROUP_ID] = store.bans[PREVIEW_GROUP_ID].filter((item: string): boolean => item !== MOCK_RBAC_EMAIL);
            }
        }
        store.previewRole = role;
    }

    function readStore(): MockStore {
        const raw: string | null = storage.getItem(storageKey);
        if (!raw) {
            const initial: MockStore = seed();
            synchronizePreviewRole(initial);
            save(initial);
            return initial;
        }
        try {
            const store: MockStore = JSON.parse(raw) as MockStore;
            if (!(MOCK_MODERATOR_EMAIL in store.memberships)) {
                store.memberships[MOCK_MODERATOR_EMAIL] = { web: "MODERATOR" };
                save(store);
            }
            if (!(MOCK_OWNER_EMAIL in store.memberships)) {
                store.memberships[MOCK_OWNER_EMAIL] = { web: "OWNER" };
                store.pending[MOCK_OWNER_EMAIL] = {};
                save(store);
            }
            const sampleGroupExists: boolean = store.groups.some(
                (group: Group): boolean => group.id === "private",
            );
            const sampleHasOwner: boolean = Object.values(store.memberships).some(
                (memberships: Record<string, GroupRole>): boolean =>
                    memberships.private === "OWNER",
            );
            if (sampleGroupExists && !sampleHasOwner) {
                store.memberships[MOCK_OWNER_EMAIL] = {
                    ...store.memberships[MOCK_OWNER_EMAIL],
                    private: "OWNER",
                };
                save(store);
            }
            if (email === MOCK_RBAC_EMAIL && store.previewRole !== getPreviewRole()) {
                synchronizePreviewRole(store);
                save(store);
            }
            return store;
        } catch {
            throw new Error("Dữ liệu mock không hợp lệ.");
        }
    }
    function save(store: MockStore): void {
        storage.setItem(storageKey, JSON.stringify(store));
    }
    function groupRole(store: MockStore, id: string): GroupRole {
        const role: string = store.memberships[email]?.[id] ?? "VISITOR";
        return role === "OWNER" || role === "MODERATOR" || role === "MEMBER"
            ? role
            : role === "ADMIN"
              ? "MEMBER"
              : "VISITOR";
    }
    function manage(store: MockStore, id: string): boolean {
        const role: GroupRole = groupRole(store, id);
        return hasGroupPermission(role, "MANAGE_CONTENT");
    }
    function canGroup(store: MockStore, id: string, permission: GroupPermission): boolean {
        return hasGroupPermission(groupRole(store, id), permission);
    }
    function requireAdmin(): void {
        const role: SystemRole = isMockSystemAdmin(email) ? "SYSTEM_ADMIN" : "USER";
        if (!hasSystemPermission(role, "ACCESS_ADMIN")) {
            throw new Error("Chỉ Admin hệ thống mới được thực hiện thao tác này.");
        }
    }

    function removeContests(store: MockStore, contestIds: Set<string>): void {
        store.contests = store.contests.filter((item: Contest): boolean => !contestIds.has(item.id));
        store.submissions = store.submissions.filter(
            (item: Submission): boolean => !contestIds.has(item.contestId),
        );
        store.notifications = store.notifications.filter((notice: RecipientNotice): boolean =>
            !Array.from(contestIds).some((id: string): boolean => notice.href === `/contests/${id}`),
        );
    }

    function removeAssessments(store: MockStore, assessmentIds: Set<string>): void {
        const contestIds: Set<string> = new Set(
            store.contests
                .filter((item: Contest): boolean => assessmentIds.has(item.assessmentId))
                .map((item: Contest): string => item.id),
        );
        removeContests(store, contestIds);
        store.assessments = store.assessments.filter(
            (item: Assessment): boolean => !assessmentIds.has(item.id),
        );
        for (const userEmail of Object.keys(store.favorites ?? {})) {
            if (store.favorites) {
                store.favorites[userEmail] = store.favorites[userEmail].filter(
                    (id: string): boolean => !assessmentIds.has(id),
                );
            }
        }
    }
    function view(store: MockStore): Snapshot {
        return {
            groups: store.groups.map(
                (group: Group): Group => ({
                    ...group,
                    role: groupRole(store, group.id),
                    pending: !!store.pending[email]?.[group.id],
                }),
            ),
            assessments: store.assessments,
            contests: store.contests,
            favoriteAssessmentIds: store.favorites?.[email] ?? [],
            bannedMembers: Object.entries(store.bans ?? {}).flatMap(
                ([groupId, users]: [string, string[]]): { groupId: string; userEmail: string }[] =>
                    canGroup(store, groupId, "MANAGE_MEMBERS") ? users.map((userEmail: string): { groupId: string; userEmail: string } => ({ groupId, userEmail })) : [],
            ),
            groupMembers: Object.entries(store.memberships).flatMap(
                ([userEmail, memberships]: [string, Record<string, GroupRole>]): GroupMember[] =>
                    Object.entries(memberships)
                        .filter(([groupId]: [string, GroupRole]): boolean => canGroup(store, groupId, "MANAGE_MEMBERS"))
                        .map(([groupId, role]: [string, GroupRole]): GroupMember => ({ groupId, userEmail, role })),
            ),
            joinRequests: Object.entries(store.pending).flatMap(
                ([userEmail, requests]: [string, Record<string, boolean>]): JoinRequest[] =>
                    Object.entries(requests)
                        .filter(
                            ([groupId, pending]: [string, boolean]): boolean =>
                                pending && canGroup(store, groupId, "MANAGE_MEMBERS"),
                        )
                        .map(
                            ([groupId]: [string, boolean]): JoinRequest => ({ groupId, userEmail }),
                        ),
            ),
            submissions: store.submissions.filter((submission: Submission): boolean => {
                const contest: Contest | undefined = store.contests.find(
                    (item: Contest): boolean => item.id === submission.contestId,
                );
                const exam: Assessment | undefined = store.assessments.find(
                    (item: Assessment): boolean => item.id === contest?.assessmentId,
                );
                return submission.authorEmail === email || (!!exam && manage(store, exam.groupId));
            }),
            notifications: store.notifications.filter(
                (notice: RecipientNotice): boolean => notice.recipientEmail === email,
            ),
        };
    }
    return {
        async read(): Promise<Snapshot> {
            return view(readStore());
        },
        async toggleFavorite(assessmentId: string): Promise<void> {
            const store: MockStore = readStore();
            if (!email) throw new Error("Bạn cần đăng nhập để lưu đề yêu thích.");
            if (!store.assessments.some((item: Assessment): boolean => item.id === assessmentId)) {
                throw new Error("Không tìm thấy đề thi.");
            }
            store.favorites ??= {};
            const current: string[] = store.favorites[email] ?? [];
            store.favorites[email] = current.includes(assessmentId)
                ? current.filter((id: string): boolean => id !== assessmentId)
                : [...current, assessmentId];
            save(store);
        },
        async updateAssessment(assessment: Assessment): Promise<void> {
            const store: MockStore = readStore();
            const index: number = store.assessments.findIndex((item: Assessment): boolean => item.id === assessment.id);
            if (index < 0 || !manage(store, store.assessments[index].groupId)) throw new Error("Bạn không có quyền sửa đề này.");
            if (assessment.groupId !== store.assessments[index].groupId) throw new Error("Không thể chuyển đề sang nhóm khác.");
            if (!assessment.title.trim() || !assessment.questions.length) throw new Error("Cần nhập tên đề và ít nhất một câu hỏi.");
            store.assessments[index] = assessment;
            save(store);
        },
        async deleteAssessment(assessmentId: string): Promise<void> {
            const store: MockStore = readStore();
            const exam: Assessment | undefined = store.assessments.find((item: Assessment): boolean => item.id === assessmentId);
            if (!exam || !manage(store, exam.groupId)) throw new Error("Bạn không có quyền xóa đề này.");
            removeAssessments(store, new Set([assessmentId]));
            save(store);
        },
        async adminDeleteContest(contestId: string): Promise<void> {
            requireAdmin();
            const store: MockStore = readStore();
            if (!store.contests.some((item: Contest): boolean => item.id === contestId)) {
                throw new Error("Không tìm thấy kỳ thi.");
            }
            removeContests(store, new Set([contestId]));
            save(store);
        },
        async adminDeleteAssessment(assessmentId: string): Promise<void> {
            requireAdmin();
            const store: MockStore = readStore();
            if (!store.assessments.some((item: Assessment): boolean => item.id === assessmentId)) {
                throw new Error("Không tìm thấy đề thi.");
            }
            removeAssessments(store, new Set([assessmentId]));
            save(store);
        },
        async adminDeleteGroup(groupId: string): Promise<void> {
            requireAdmin();
            const store: MockStore = readStore();
            if (!store.groups.some((item: Group): boolean => item.id === groupId)) {
                throw new Error("Không tìm thấy nhóm.");
            }
            const assessmentIds: Set<string> = new Set(
                store.assessments
                    .filter((item: Assessment): boolean => item.groupId === groupId)
                    .map((item: Assessment): string => item.id),
            );
            removeAssessments(store, assessmentIds);
            store.groups = store.groups.filter((item: Group): boolean => item.id !== groupId);
            for (const memberships of Object.values(store.memberships)) {
                delete memberships[groupId];
            }
            for (const pending of Object.values(store.pending)) {
                delete pending[groupId];
            }
            if (store.bans) delete store.bans[groupId];
            store.notifications = store.notifications.filter(
                (notice: RecipientNotice): boolean => notice.href !== `/groups/${groupId}`,
            );
            save(store);
        },
        async updateGroup(groupId: string, name: string, description: string, visibility: Group["visibility"], joinPolicy: Group["joinPolicy"], password: string): Promise<void> {
            const store: MockStore = readStore();
            const group: Group | undefined = store.groups.find((item: Group): boolean => item.id === groupId);
            if (!group || !canGroup(store, groupId, "MANAGE_SETTINGS")) throw new Error("Chỉ chủ nhóm được thay đổi cài đặt.");
            if (!name.trim()) throw new Error("Tên nhóm không được để trống.");
            if (visibility === "PRIVATE" && joinPolicy === "OPEN") throw new Error("Nhóm riêng tư cần phê duyệt hoặc mật khẩu.");
            if (visibility === "PRIVATE" && joinPolicy === "PASSWORD" && !password.trim()) throw new Error("Hãy nhập mật khẩu nhóm thử nghiệm.");
            group.name = name.trim();
            group.description = description.trim();
            group.visibility = visibility;
            group.joinPolicy = visibility === "PUBLIC" ? "OPEN" : joinPolicy;
            group.password = visibility === "PRIVATE" && joinPolicy === "PASSWORD" ? password : undefined;
            save(store);
        },
        async setGroupMemberRole(groupId: string, userEmail: string, role: "MEMBER" | "MODERATOR"): Promise<void> {
            const store: MockStore = readStore();
            if (!canGroup(store, groupId, "ASSIGN_MODERATOR")) throw new Error("Chỉ chủ nhóm được bổ nhiệm điều hành viên.");
            const memberRole: GroupRole | undefined = store.memberships[userEmail]?.[groupId];
            if (memberRole !== "MEMBER" && memberRole !== "MODERATOR") throw new Error("Người dùng không phải thành viên hợp lệ.");
            store.memberships[userEmail][groupId] = role;
            save(store);
        },
        async removeGroupMember(groupId: string, userEmail: string): Promise<void> {
            const store: MockStore = readStore();
            if (!canGroup(store, groupId, "MANAGE_MEMBERS")) throw new Error("Bạn không có quyền quản lý thành viên.");
            const memberRole: GroupRole | undefined = store.memberships[userEmail]?.[groupId];
            if (!memberRole || !canManageMember(groupRole(store, groupId), memberRole)) {
                throw new Error("Không thể xóa thành viên này.");
            }
            delete store.memberships[userEmail][groupId];
            save(store);
        },
        async banGroupMember(groupId: string, userEmail: string): Promise<void> {
            const store: MockStore = readStore();
            if (!canGroup(store, groupId, "MANAGE_MEMBERS")) throw new Error("Bạn không có quyền quản lý thành viên.");
            const memberRole: GroupRole | undefined = store.memberships[userEmail]?.[groupId];
            if (!memberRole || !canManageMember(groupRole(store, groupId), memberRole)) {
                throw new Error("Không thể cấm thành viên này.");
            }
            delete store.memberships[userEmail][groupId];
            store.bans ??= {};
            store.bans[groupId] = [...new Set([...(store.bans[groupId] ?? []), userEmail])];
            save(store);
        },
        async unbanGroupMember(groupId: string, userEmail: string): Promise<void> {
            const store: MockStore = readStore();
            if (!canGroup(store, groupId, "MANAGE_MEMBERS")) throw new Error("Bạn không có quyền quản lý thành viên.");
            if (!store.bans?.[groupId]?.includes(userEmail)) throw new Error("Tài khoản này không bị cấm.");
            store.bans[groupId] = store.bans[groupId].filter((item: string): boolean => item !== userEmail);
            save(store);
        },
        async transferGroupOwnership(groupId: string, userEmail: string): Promise<void> {
            const store: MockStore = readStore();
            if (!canGroup(store, groupId, "TRANSFER_OWNERSHIP")) throw new Error("Chỉ chủ nhóm được chuyển quyền.");
            const memberRole: GroupRole | undefined = store.memberships[userEmail]?.[groupId];
            if (memberRole !== "MEMBER" && memberRole !== "MODERATOR") throw new Error("Chọn thành viên của nhóm.");
            store.memberships[userEmail][groupId] = "OWNER";
            store.memberships[email][groupId] = "MEMBER";
            save(store);
        },
        async deleteOwnedGroup(groupId: string): Promise<void> {
            const store: MockStore = readStore();
            if (!canGroup(store, groupId, "DELETE_GROUP")) throw new Error("Chỉ chủ nhóm được xóa nhóm.");
            const assessmentIds: Set<string> = new Set(store.assessments.filter((item: Assessment): boolean => item.groupId === groupId).map((item: Assessment): string => item.id));
            removeAssessments(store, assessmentIds);
            store.groups = store.groups.filter((item: Group): boolean => item.id !== groupId);
            for (const memberships of Object.values(store.memberships)) delete memberships[groupId];
            for (const pending of Object.values(store.pending)) delete pending[groupId];
            if (store.bans) delete store.bans[groupId];
            store.notifications = store.notifications.filter((notice: RecipientNotice): boolean => notice.href !== `/groups/${groupId}`);
            save(store);
        },
        async createGroup(group: Group): Promise<void> {
            const store: MockStore = readStore();
            if (!group.name.trim()) throw new Error("Hãy nhập tên nhóm.");
            store.groups.unshift({ ...group, role: "VISITOR", pending: false });
            store.memberships[email] = { ...store.memberships[email], [group.id]: "OWNER" };
            save(store);
        },
        async createContest(contest: Contest): Promise<void> {
            const store: MockStore = readStore();
            const exam: Assessment | undefined = store.assessments.find(
                (item: Assessment): boolean => item.id === contest.assessmentId,
            );
            if (!exam || !manage(store, exam.groupId))
                throw new Error("Bạn không có quyền tạo kỳ thi cho nhóm này.");
            if (!contest.title.trim() || Date.parse(contest.startAt) >= Date.parse(contest.endAt))
                throw new Error("Tên kỳ thi và thời gian chưa hợp lệ.");
            store.contests.unshift(contest);
            save(store);
        },
        async createAssessment(assessment: Assessment): Promise<void> {
            const store: MockStore = readStore();
            if (
                !store.groups.some((group: Group): boolean => group.id === assessment.groupId) ||
                !manage(store, assessment.groupId)
            )
                throw new Error("Chỉ Owner hoặc Moderator của nhóm mới được tạo đề.");
            if (!assessment.title.trim() || !assessment.questions.length)
                throw new Error("Cần nhập tên đề và ít nhất một câu hỏi hoặc đáp án PDF.");
            if (assessment.source === "PDF" && !assessment.pdfName)
                throw new Error("Hãy chọn tệp PDF.");
            store.assessments.unshift(assessment);
            save(store);
        },
        async joinGroup(groupId: string, password: string): Promise<void> {
            const store: MockStore = readStore();
            const group: Group | undefined = store.groups.find(
                (item: Group): boolean => item.id === groupId,
            );
            if (!group) throw new Error("Không tìm thấy nhóm.");
            if (store.bans?.[groupId]?.includes(email)) throw new Error("Bạn đã bị cấm tham gia nhóm này.");
            if (groupRole(store, groupId) !== "VISITOR") return;
            if (group.joinPolicy === "PASSWORD" && password !== (group.password ?? "demo1234"))
                throw new Error("Mật khẩu thử nghiệm chưa đúng.");
            if (group.joinPolicy === "APPROVAL") {
                if (store.pending[email]?.[groupId]) return;
                store.pending[email] = { ...store.pending[email], [groupId]: true };
                const recipients: Set<string> = new Set<string>();
                Object.entries(store.memberships).forEach(
                    ([managerEmail, memberships]: [string, Record<string, GroupRole>]): void => {
                        if (memberships[groupId] === "OWNER" || memberships[groupId] === "MODERATOR") {
                            recipients.add(managerEmail);
                        }
                    },
                );
                recipients.delete(email);
                recipients.forEach((recipientEmail: string): void => {
                    store.notifications.unshift({
                        id: crypto.randomUUID(),
                        recipientEmail,
                        title: "Yêu cầu tham gia nhóm",
                        body: `${email} muốn tham gia nhóm ${group.name}.`,
                        createdAt: new Date().toISOString(),
                        read: false,
                        href: `/groups/${groupId}`,
                    });
                });
            } else {
                store.memberships[email] = { ...store.memberships[email], [groupId]: "MEMBER" };
            }
            save(store);
        },
        async leaveGroup(groupId: string): Promise<void> {
            const store: MockStore = readStore();
            const group: Group | undefined = store.groups.find(
                (item: Group): boolean => item.id === groupId,
            );
            if (!group) throw new Error("Không tìm thấy nhóm.");
            const role: GroupRole = groupRole(store, groupId);
            if (role === "OWNER")
                throw new Error("Owner chưa thể rời nhóm khi chưa có chức năng chuyển quyền.");
            if (role !== "MEMBER" && role !== "MODERATOR") throw new Error("Bạn chưa là thành viên của nhóm.");
            delete store.memberships[email][groupId];
            if (store.pending[email]) delete store.pending[email][groupId];
            save(store);
        },
        async reviewJoinRequest(
            groupId: string,
            userEmail: string,
            decision: "APPROVE" | "REJECT",
        ): Promise<void> {
            const store: MockStore = readStore();
            const group: Group | undefined = store.groups.find(
                (item: Group): boolean => item.id === groupId,
            );
            if (!group || !canGroup(store, groupId, "MANAGE_MEMBERS"))
                throw new Error("Bạn không có quyền duyệt yêu cầu của nhóm.");
            if (!store.pending[userEmail]?.[groupId])
                throw new Error("Yêu cầu không còn chờ duyệt.");
            delete store.pending[userEmail][groupId];
            if (decision === "APPROVE") {
                store.memberships[userEmail] = {
                    ...store.memberships[userEmail],
                    [groupId]: "MEMBER",
                };
            }
            store.notifications.unshift({
                id: crypto.randomUUID(),
                recipientEmail: userEmail,
                title:
                    decision === "APPROVE"
                        ? "Yêu cầu tham gia đã được duyệt"
                        : "Yêu cầu tham gia đã bị từ chối",
                body:
                    decision === "APPROVE"
                        ? `Bạn đã là thành viên nhóm ${group.name}.`
                        : `Yêu cầu tham gia nhóm ${group.name} chưa được chấp nhận.`,
                createdAt: new Date().toISOString(),
                read: false,
                href: `/groups/${groupId}`,
            });
            save(store);
        },
        async markRead(id: string): Promise<void> {
            const store: MockStore = readStore();
            const notice: RecipientNotice | undefined = store.notifications.find(
                (item: RecipientNotice): boolean => item.id === id && item.recipientEmail === email,
            );
            if (notice) notice.read = true;
            save(store);
        },
        async grade(id: string, score: number, feedback: string): Promise<void> {
            const store: MockStore = readStore();
            const submission: Submission | undefined = store.submissions.find(
                (item: Submission): boolean => item.id === id,
            );
            const contest: Contest | undefined = store.contests.find(
                (item: Contest): boolean => item.id === submission?.contestId,
            );
            const exam: Assessment | undefined = store.assessments.find(
                (item: Assessment): boolean => item.id === contest?.assessmentId,
            );
            if (!submission || !exam || !manage(store, exam.groupId))
                throw new Error("Bạn không có quyền chấm bài này.");
            if (!Number.isFinite(score) || score < 0 || score > 10)
                throw new Error("Điểm phải từ 0 đến 10.");
            submission.status = "GRADED";
            submission.score = score;
            submission.feedback = feedback;
            store.notifications.unshift({
                id: crypto.randomUUID(),
                recipientEmail: submission.authorEmail,
                title: "Bài nộp đã được chấm thử",
                body: `Điểm mô phỏng: ${score}/10.`,
                createdAt: new Date().toISOString(),
                read: false,
                href: `/contests/${submission.contestId}`,
            });
            save(store);
        },
        async startAttempt(contestId: string): Promise<void> {
            const store: MockStore = readStore();
            const contest: Contest | undefined = store.contests.find((item: Contest): boolean => item.id === contestId);
            if (!contest || Date.now() < Date.parse(contest.startAt) || Date.now() >= Date.parse(contest.endAt)) throw new Error("Kỳ thi không trong thời gian nhận bài.");
            const exam: Assessment | undefined = store.assessments.find((item: Assessment): boolean => item.id === contest.assessmentId);
            const group: Group | undefined = store.groups.find((item: Group): boolean => item.id === exam?.groupId);
            if (!email || !group || (group.visibility === "PRIVATE" && groupRole(store, group.id) === "VISITOR")) throw new Error("Bạn không có quyền tham gia kỳ thi.");
            store.attempts ??= {};
            store.attempts[`${email}:${contestId}`] ??= Date.now();
            save(store);
        },
        async submit(contestId: string, answers: Record<string, string[]>, auto: boolean = false): Promise<void> {
            const store: MockStore = readStore();
            const contest: Contest | undefined = store.contests.find(
                (item: Contest): boolean => item.id === contestId,
            );
            if (
                !contest ||
                Date.now() < Date.parse(contest.startAt) ||
                (Date.now() >= Date.parse(contest.endAt) &&
                    !(auto && store.attempts?.[`${email}:${contestId}`] !== undefined &&
                        store.attempts[`${email}:${contestId}`] < Date.parse(contest.endAt)))
            )
                throw new Error("Kỳ thi không trong thời gian nhận bài.");
            const exam: Assessment | undefined = store.assessments.find(
                (item: Assessment): boolean => item.id === contest.assessmentId,
            );
            const group: Group | undefined = store.groups.find(
                (item: Group): boolean => item.id === exam?.groupId,
            );
            if (
                !group ||
                (group.visibility === "PRIVATE" && groupRole(store, group.id) === "VISITOR")
            )
                throw new Error("Bạn cần là thành viên để tham gia kỳ thi của nhóm riêng tư.");
            if (
                contest.policy === "SINGLE" &&
                store.submissions.some(
                    (item: Submission): boolean =>
                        item.contestId === contestId && item.authorEmail === email,
                )
            )
                throw new Error("Bạn đã nộp bài.");
            store.submissions.unshift({
                id: crypto.randomUUID(),
                authorEmail: email,
                contestId,
                answers,
                submittedAt: new Date().toISOString(),
                status: "PENDING",
            });
            if (store.attempts) delete store.attempts[`${email}:${contestId}`];
            store.notifications.unshift({
                id: crypto.randomUUID(),
                recipientEmail: email,
                title: "Đã nộp bài thử nghiệm",
                body: `Bài nộp của kỳ thi ${contest.title} đang chờ xử lý.`,
                createdAt: new Date().toISOString(),
                read: false,
                href: `/contests/${contestId}`,
            });
            save(store);
        },
    };
}
