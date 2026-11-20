import { CalendarDays } from "lucide-react";
import type { Dispatch,SetStateAction } from "react";
import { useState,type FormEvent,type ReactNode } from "react";
import { Link,useNavigate } from "react-router-dom";
import { canManage,useApp } from "../../../shared/context";
import type { Assessment,Group } from "../../../types";

export function NewContest(): ReactNode {
    const { data, api, refresh }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const [title, setTitle]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const groupId: string = new URLSearchParams(location.search).get("group") ?? "";
    const [assessmentId, setAssessmentId]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [startAt, setStartAt]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [endAt, setEndAt]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [policy, setPolicy]: [
        "SINGLE" | "MULTIPLE",
        Dispatch<SetStateAction<"SINGLE" | "MULTIPLE">>,
    ] = useState<"SINGLE" | "MULTIPLE">("SINGLE");
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === groupId && canManage(item),
    );
    const exams: Assessment[] = data.assessments.filter(
        (exam: Assessment): boolean => exam.groupId === groupId,
    );
    async function create(event: FormEvent): Promise<void> {
        event.preventDefault();
        if (
            !group ||
            !title.trim() ||
            !exams.some((exam: Assessment): boolean => exam.id === assessmentId) ||
            !startAt ||
            !endAt ||
            Date.parse(startAt) >= Date.parse(endAt)
        ) {
            setError("Kiểm tra tên, đề và thời gian kết thúc sau thời gian bắt đầu.");
            return;
        }
        const id: string = crypto.randomUUID();
        try {
            await api.createContest({
                id,
                title: title.trim(),
                assessmentId,
                startAt: new Date(startAt).toISOString(),
                endAt: new Date(endAt).toISOString(),
                policy,
            });
            await refresh();
            navigate(`/contests/${id}`);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không tạo được kỳ thi.");
        }
    }
    if (!group) return <p className="empty">Hãy vào nhóm bạn quản lý để tạo kỳ thi.</p>;
    return (
        <div className="contest-create-page">
            <div className="assessment-breadcrumb">
                <Link to={`/groups/${group.id}`}>{group.name}</Link>
                <span>/</span>
                <span>Tạo kỳ thi</span>
            </div>
            <header className="assessment-hero">
                <span className="assessment-hero-icon">
                    <CalendarDays size={25} />
                </span>
                <div className="assessment-hero-content">
                    <div className="assessment-hero-label">
                        <span>QUẢN LÝ KỲ THI</span>
                    </div>
                    <h1>Tạo kỳ thi</h1>
                    <p>Chọn đề thuộc nhóm và thiết lập thời gian làm bài.</p>
                </div>
            </header>
            <form
                className="assessment-section form contest-create-form"
                onSubmit={(event): void => {
                    void create(event);
                }}
            >
                <div className="contest-create-heading">
                    <p className="assessment-section-kicker">THÔNG TIN CHUNG</p>
                    <h2>Thiết lập kỳ thi</h2>
                    <p>Điền thông tin để tạo kỳ thi cho nhóm {group.name}.</p>
                </div>
                <label>
                    Tên kỳ thi
                    <input
                        required
                        value={title}
                        onChange={(event): void => setTitle(event.target.value)}
                    />
                </label>
                <label>
                    Đề thi
                    <select
                        required
                        value={assessmentId}
                        onChange={(event): void => setAssessmentId(event.target.value)}
                    >
                        <option value="">Chọn đề</option>
                        {exams.map(
                            (exam: Assessment): ReactNode => (
                                <option value={exam.id} key={exam.id}>
                                    {exam.title} ·{" "}
                                    {
                                        data.groups.find(
                                            (group: Group): boolean => group.id === exam.groupId,
                                        )?.name
                                    }
                                </option>
                            ),
                        )}
                    </select>
                </label>
                <div className="two-col">
                    <label>
                        Bắt đầu
                        <input
                            type="datetime-local"
                            required
                            value={startAt}
                            onChange={(event): void => setStartAt(event.target.value)}
                        />
                    </label>
                    <label>
                        Kết thúc
                        <input
                            type="datetime-local"
                            required
                            value={endAt}
                            onChange={(event): void => setEndAt(event.target.value)}
                        />
                    </label>
                </div>
                <label>
                    Quy định nộp
                    <select
                        value={policy}
                        onChange={(event): void =>
                            setPolicy(event.target.value as "SINGLE" | "MULTIPLE")
                        }
                    >
                        <option value="SINGLE">Một lần</option>
                        <option value="MULTIPLE">Nhiều lần, tính bài cuối</option>
                    </select>
                </label>
                <p className="hint">Phạm vi theo nhóm của đề. Dữ liệu chỉ lưu trong trình duyệt.</p>
                {error && <p className="error">{error}</p>}
                <button className="button primary">Tạo kỳ thi thử nghiệm</button>
            </form>
        </div>
    );
}
