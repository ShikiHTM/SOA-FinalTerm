import type { Dispatch,SetStateAction } from "react";
import { useState,type FormEvent,type ReactNode } from "react";
import { Link,useNavigate,useParams } from "react-router-dom";
import { canManage,PageTitle,useApp } from "../../../shared/context";
import type { Assessment,Group,Question,QuestionKind } from "../../../types";

function id(): string {
    return crypto.randomUUID();
}

function makeQuestion(kind: QuestionKind = "SINGLE"): Question {
    const hasChoices: boolean = kind === "SINGLE" || kind === "MULTIPLE";

    return {
        id: id(),
        kind,
        text: "",
        points: 1,
        options: hasChoices ? ["", ""] : [],
        answers: [],
    };
}

export function AssessmentEditor(): ReactNode {
    const { data, api, refresh }: ReturnType<typeof useApp> = useApp();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();
    const { assessmentId }: { assessmentId?: string } = useParams();
    const existing: Assessment | undefined = data.assessments.find((item: Assessment): boolean => item.id === assessmentId);
    const initialGroup: string = existing?.groupId ?? new URLSearchParams(location.search).get("group") ?? "";
    const [groupId, setGroupId]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>(initialGroup);
    const [title, setTitle]: [string, Dispatch<SetStateAction<string>>] = useState<string>(existing?.title ?? "");
    const [description, setDescription]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>(existing?.description ?? "");
    const [source, setSource]: ["DIRECT" | "PDF", Dispatch<SetStateAction<"DIRECT" | "PDF">>] =
        useState<"DIRECT" | "PDF">(existing?.source ?? "DIRECT");
    const [pdfName, setPdfName]: [string, Dispatch<SetStateAction<string>>] = useState<string>(existing?.pdfName ?? "");
    const [practice, setPractice]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(existing?.practice ?? true);
    const [questions, setQuestions]: [Question[], Dispatch<SetStateAction<Question[]>>] = useState<
        Question[]
    >(existing?.questions ?? [makeQuestion()]);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const groups: Group[] = data.groups.filter(
        (item: Group): boolean => item.id === initialGroup && canManage(item),
    );
    const group: Group | undefined = groups.find((item: Group): boolean => item.id === groupId);
    if ((assessmentId && !existing) || !groups.length) return <p className="empty">Không tìm thấy đề hoặc bạn không có quyền quản lý.</p>;
    function update(index: number, value: Question): void {
        setQuestions(
            questions.map((item: Question, i: number): Question => (i === index ? value : item)),
        );
    }
    function validate(): string {
        if (!group || !title.trim()) return "Chọn nhóm được quản lý và nhập tên đề.";
        if (source === "PDF" && !pdfName.toLowerCase().endsWith(".pdf"))
            return "Chọn tệp PDF hợp lệ.";
        if (!questions.length) return "Hãy thêm ít nhất một câu hỏi hoặc đáp án.";
        for (let index: number = 0; index < questions.length; index += 1) {
            const question: Question = questions[index];
            if (source === "DIRECT" && !question.text.trim())
                return "Nhập nội dung cho mỗi câu hỏi.";
            if (!Number.isFinite(question.points) || question.points <= 0)
                return "Điểm của mỗi câu phải lớn hơn 0.";
            if (question.kind === "SINGLE" || question.kind === "MULTIPLE") {
                if (
                    source === "DIRECT" &&
                    (question.options.length < 2 ||
                        question.options.some((option: string): boolean => !option.trim()) ||
                        new Set(question.options.map((option: string): string => option.trim()))
                            .size !== question.options.length)
                )
                    return "Mỗi câu trắc nghiệm cần ít nhất hai lựa chọn khác nhau, không để trống.";
                if (
                    !question.answers.some((answer: string): boolean => !!answer.trim()) ||
                    (question.kind === "SINGLE" &&
                        question.answers.filter((answer: string): boolean => !!answer.trim())
                            .length !== 1)
                )
                    return "Chọn đáp án hợp lệ cho mỗi câu trắc nghiệm.";
            }
            if (
                question.kind === "FILL" &&
                !question.answers.some((answer: string): boolean => !!answer.trim())
            )
                return "Nhập đáp án cho câu điền khuyết.";
        }
        return "";
    }
    async function save(event: FormEvent): Promise<void> {
        event.preventDefault();
        const problem: string = validate();
        if (problem) {
            setError(problem);
            return;
        }
        try {
            // TODO: Gửi đề nhập trực tiếp hoặc PDF theo contract Assessment và luồng lưu trữ đã thống nhất.
            const assessment: Assessment = {
                id: existing?.id ?? id(),
                groupId,
                title: title.trim(),
                description: description.trim(),
                source,
                pdfName: source === "PDF" ? pdfName : undefined,
                practice: group?.visibility === "PUBLIC" || practice,
                questions,
            };
            if (existing) await api.updateAssessment(assessment);
            else await api.createAssessment(assessment);
            await refresh();
            navigate(`/groups/${groupId}`);
        } catch (reason: unknown) {
            setError(reason instanceof Error ? reason.message : "Không lưu được đề.");
        }
    }
    function changeSource(value: "DIRECT" | "PDF"): void {
        setSource(value);
        setQuestions([makeQuestion()]);
        setError("");
    }
    return (
        <>
            <Link className="back" to={`/groups/${initialGroup}`}>
                ← Nhóm học tập
            </Link>
            <PageTitle
                label="QUẢN LÝ ĐỀ"
                title={existing ? "Chỉnh sửa đề thi" : "Tạo đề thi"}
                description="Chọn nhóm bạn quản lý và nhập nội dung đề."
            />
            <form
                onSubmit={(event): void => {
                    void save(event);
                }}
                className="form editor"
            >
                <section className="panel form">
                    <h2>Thông tin đề</h2>
                    <label>
                        Nhóm sở hữu
                        <select
                            required
                            value={groupId}
                            onChange={(event): void => setGroupId(event.target.value)}
                        >
                            <option value="">Chọn nhóm</option>
                            {groups.map(
                                (item: Group): ReactNode => (
                                    <option value={item.id} key={item.id}>
                                        {item.name} · {item.role}
                                    </option>
                                ),
                            )}
                        </select>
                    </label>
                    <p className="hint">
                        {group
                            ? `Phạm vi theo nhóm: ${group.visibility === "PUBLIC" ? "công khai cho người đã đăng nhập" : "riêng tư"}.`
                            : "Chỉ Owner của nhóm có thể tạo đề; phạm vi được xác định bởi nhóm."}
                    </p>
                    <label>
                        Tên đề
                        <input
                            required
                            value={title}
                            onChange={(event): void => setTitle(event.target.value)}
                            maxLength={100}
                        />
                    </label>
                    <label>
                        Mô tả
                        <textarea
                            value={description}
                            onChange={(event): void => setDescription(event.target.value)}
                            rows={3}
                        />
                    </label>
                    <label>
                        Cách tạo đề
                        <select
                            value={source}
                            onChange={(event): void =>
                                changeSource(event.target.value as "DIRECT" | "PDF")
                            }
                        >
                            <option value="DIRECT">Nhập câu hỏi trực tiếp</option>
                            <option value="PDF">PDF và ánh xạ đáp án trắc nghiệm</option>
                        </select>
                    </label>
                    {source === "PDF" && (
                        <>
                            <label>
                                Tệp PDF
                                <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    onChange={(event): void =>
                                        setPdfName(event.target.files?.[0]?.name ?? "")
                                    }
                                />
                            </label>
                            <p className="hint">
                                Bản thử chỉ lưu tên tệp, không tải hoặc lưu nội dung PDF. Hãy ánh xạ
                                câu trả lời trắc nghiệm bên dưới.
                            </p>
                        </>
                    )}
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={group?.visibility === "PUBLIC" || practice}
                            disabled={group?.visibility === "PUBLIC"}
                            onChange={(event): void => setPractice(event.target.checked)}
                        />{" "}
                        Cho phép luyện tập
                    </label>
                    {group?.visibility === "PUBLIC" && (
                        <p className="hint">
                            Đề công khai được mở luyện tập cho mọi User đã đăng nhập.
                        </p>
                    )}
                </section>
                <section className="panel">
                    <div className="section-heading">
                        <div>
                            <h2>{source === "PDF" ? "Ánh xạ đáp án PDF" : "Danh sách câu hỏi"}</h2>
                            <p className="muted">
                                Đặt điểm và đáp án cho từng câu. Tự luận được chấm thủ công.
                            </p>
                        </div>
                    </div>
                    <div className="form">
                        {questions.map(
                            (question: Question, index: number): ReactNode => (
                                <div className="question-editor" key={question.id}>
                                    <div className="question-top">
                                        <strong>Câu {index + 1}</strong>
                                        <button
                                            type="button"
                                            className="link-button"
                                            onClick={(): void =>
                                                setQuestions(
                                                    questions.filter(
                                                        (item: Question): boolean =>
                                                            item.id !== question.id,
                                                    ),
                                                )
                                            }
                                        >
                                            Xóa câu
                                        </button>
                                    </div>
                                    {source === "DIRECT" && (
                                        <label>
                                            Nội dung
                                            <textarea
                                                rows={2}
                                                value={question.text}
                                                onChange={(event): void =>
                                                    update(index, {
                                                        ...question,
                                                        text: event.target.value,
                                                    })
                                                }
                                            />
                                        </label>
                                    )}
                                    <div className="two-col">
                                        <label>
                                            Loại câu
                                            <select
                                                value={question.kind}
                                                onChange={(event): void => {
                                                    const kind: QuestionKind = event.target
                                                        .value as QuestionKind;
                                                    update(index, {
                                                        ...makeQuestion(kind),
                                                        id: question.id,
                                                        text: question.text,
                                                        points: question.points,
                                                    });
                                                }}
                                            >
                                                <option value="SINGLE">Một lựa chọn</option>
                                                <option value="MULTIPLE">Nhiều lựa chọn</option>
                                                {source === "DIRECT" && (
                                                    <>
                                                        <option value="FILL">Điền khuyết</option>
                                                        <option value="ESSAY">Tự luận</option>
                                                    </>
                                                )}
                                            </select>
                                        </label>
                                        <label>
                                            Điểm
                                            <input
                                                type="number"
                                                min="0.01"
                                                step="0.01"
                                                value={question.points}
                                                onChange={(event): void =>
                                                    update(index, {
                                                        ...question,
                                                        points: Number(event.target.value),
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                    {source === "PDF" ? (
                                        <label>
                                            Đáp án{" "}
                                            {question.kind === "MULTIPLE" &&
                                                "(ngăn cách bằng dấu phẩy)"}
                                            <input
                                                placeholder="Ví dụ: A hoặc A, C"
                                                value={question.answers.join(", ")}
                                                onChange={(event): void =>
                                                    update(index, {
                                                        ...question,
                                                        answers: event.target.value
                                                            .split(",")
                                                            .map((value: string): string =>
                                                                value.trim(),
                                                            ),
                                                    })
                                                }
                                            />
                                        </label>
                                    ) : question.kind === "SINGLE" ||
                                      question.kind === "MULTIPLE" ? (
                                        <div className="form">
                                            <span className="label">Lựa chọn và đáp án đúng</span>
                                            {question.options.map(
                                                (
                                                    option: string,
                                                    optionIndex: number,
                                                ): ReactNode => (
                                                    <div className="option-edit" key={optionIndex}>
                                                        <input
                                                            aria-label={`Đáp án đúng lựa chọn ${optionIndex + 1}`}
                                                            type={
                                                                question.kind === "SINGLE"
                                                                    ? "radio"
                                                                    : "checkbox"
                                                            }
                                                            name={`answer-${question.id}`}
                                                            checked={question.answers.includes(
                                                                String(optionIndex),
                                                            )}
                                                            onChange={(event): void => {
                                                                const key: string =
                                                                    String(optionIndex);
                                                                update(index, {
                                                                    ...question,
                                                                    answers:
                                                                        question.kind === "SINGLE"
                                                                            ? [key]
                                                                            : event.target.checked
                                                                              ? [
                                                                                    ...question.answers,
                                                                                    key,
                                                                                ]
                                                                              : question.answers.filter(
                                                                                    (
                                                                                        answer: string,
                                                                                    ): boolean =>
                                                                                        answer !==
                                                                                        key,
                                                                                ),
                                                                });
                                                            }}
                                                        />
                                                        <input
                                                            aria-label={`Nội dung lựa chọn ${optionIndex + 1}`}
                                                            value={option}
                                                            onChange={(event): void =>
                                                                update(index, {
                                                                    ...question,
                                                                    options: question.options.map(
                                                                        (
                                                                            text: string,
                                                                            i: number,
                                                                        ): string =>
                                                                            i === optionIndex
                                                                                ? event.target.value
                                                                                : text,
                                                                    ),
                                                                })
                                                            }
                                                        />
                                                    </div>
                                                ),
                                            )}
                                            <button
                                                type="button"
                                                className="button"
                                                onClick={(): void =>
                                                    update(index, {
                                                        ...question,
                                                        options: [...question.options, ""],
                                                    })
                                                }
                                            >
                                                + Thêm lựa chọn
                                            </button>
                                        </div>
                                    ) : question.kind === "FILL" ? (
                                        <label>
                                            Đáp án
                                            <input
                                                value={question.answers[0] ?? ""}
                                                onChange={(event): void =>
                                                    update(index, {
                                                        ...question,
                                                        answers: [event.target.value],
                                                    })
                                                }
                                            />
                                        </label>
                                    ) : (
                                        <p className="hint">Câu tự luận chờ chấm thủ công.</p>
                                    )}
                                </div>
                            ),
                        )}
                        <button
                            type="button"
                            className="button"
                            onClick={(): void => setQuestions([...questions, makeQuestion()])}
                        >
                            + Thêm câu
                        </button>
                    </div>
                </section>
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <div className="editor-footer">
                    <span className="hint">
                        Bản mẫu lưu dữ liệu trong trình duyệt; chưa tạo content.json hoặc
                        answer.json trên S3.
                    </span>
                    <button className="button primary">Lưu đề thử nghiệm</button>
                </div>
            </form>
        </>
    );
}
