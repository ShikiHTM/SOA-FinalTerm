import {
    useCallback,
    useEffect,
    useState,
    type Dispatch,
    type FormEvent,
    type ReactNode,
    type SetStateAction
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { assessmentsApi, groupsApi } from "../../../api/client";
import type {
    AnswerKeyItem,
    AssessmentMetadata,
    AssessmentType,
    AssessmentVisibility,
    GroupSummary,
    QuestionInput,
    QuestionOption,
    QuestionType
} from "../../../api/types";
import { extractErrorMessage } from "../../../data/http/httpClient";
import { canManage, PageTitle, useApp } from "../../../shared/context";
import { PDF_CHOICE_KEYS } from "../components/PdfAnswerSheet";

interface EditableQuestion {
    id: string;
    question_type: QuestionType;
    prompt: string;
    points: number;
    options: QuestionOption[];
    correct_answer: string | string[];
    grading_rubric: string;
}

function makeOptionKey(index: number): string {
    return String.fromCharCode(65 + index);
}

function makeEditableQuestion(questionType: QuestionType = "SINGLE_CHOICE"): EditableQuestion {
    const hasChoices: boolean =
        questionType === "SINGLE_CHOICE" || questionType === "MULTIPLE_CHOICE";
    return {
        id: crypto.randomUUID(),
        question_type: questionType,
        prompt: "",
        points: 10,
        options: hasChoices
            ? ["A", "B", "C", "D"].map((key: string): QuestionOption => ({ key, text: "" }))
            : [],
        correct_answer: questionType === "MULTIPLE_CHOICE" ? [] : "",
        grading_rubric: ""
    };
}

function deriveAssessmentType(items: Array<{ question_type: QuestionType }>): AssessmentType {
    const hasEssay: boolean = items.some(
        (item): boolean => item.question_type === "ESSAY"
    );
    const hasObjective: boolean = items.some(
        (item): boolean => item.question_type !== "ESSAY"
    );
    if (hasEssay && hasObjective) {
        return "HYBRID";
    }
    if (hasEssay) {
        return "ESSAY";
    }
    return "MULTI_CHOICE";
}

export function AssessmentEditor(): ReactNode {
    const { user }: ReturnType<typeof useApp> = useApp();
    const { assessmentId }: { assessmentId?: string } = useParams();
    const location: ReturnType<typeof useLocation> = useLocation();
    const navigate: ReturnType<typeof useNavigate> = useNavigate();

    const queryGroupId: string = new URLSearchParams(location.search).get("group") ?? "";

    const [managedGroups, setManagedGroups]: [GroupSummary[], Dispatch<SetStateAction<GroupSummary[]>>] =
        useState<GroupSummary[]>([]);
    const [existing, setExisting]: [
        AssessmentMetadata | null,
        Dispatch<SetStateAction<AssessmentMetadata | null>>
    ] = useState<AssessmentMetadata | null>(null);
    const [groupId, setGroupId]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>(queryGroupId);
    const [title, setTitle]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");
    const [description, setDescription]: [string, Dispatch<SetStateAction<string>>] =
        useState<string>("");
    const [mode, setMode]: ["DIRECT" | "PDF", Dispatch<SetStateAction<"DIRECT" | "PDF">>] =
        useState<"DIRECT" | "PDF">("DIRECT");
    const [visibility, setVisibility]: [
        AssessmentVisibility,
        Dispatch<SetStateAction<AssessmentVisibility>>
    ] = useState<AssessmentVisibility>("PRIVATE");
    const [practiceEnabled, setPracticeEnabled]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(false);
    const [pdfFile, setPdfFile]: [File | null, Dispatch<SetStateAction<File | null>>] =
        useState<File | null>(null);
    const [questions, setQuestions]: [
        EditableQuestion[],
        Dispatch<SetStateAction<EditableQuestion[]>>
    ] = useState<EditableQuestion[]>([makeEditableQuestion()]);
    const [loading, setLoading]: [boolean, Dispatch<SetStateAction<boolean>>] =
        useState<boolean>(true);
    const [busy, setBusy]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const [error, setError]: [string, Dispatch<SetStateAction<string>>] = useState<string>("");

    const loadInitial: () => Promise<void> = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError("");
        try {
            const myGroupsRes = await groupsApi.listMine({ page: 1, limit: 100 });
            const manageable: GroupSummary[] = myGroupsRes.items.filter((item: GroupSummary): boolean =>
                canManage(item, user.system_role)
            );
            setManagedGroups(manageable);

            if (assessmentId) {
                const [meta, content, keyDoc] = await Promise.all([
                    assessmentsApi.getById(assessmentId),
                    assessmentsApi.getContent(assessmentId),
                    assessmentsApi.getAnswerKey(assessmentId).catch((): null => null)
                ]);
                setExisting(meta);
                setGroupId(meta.group_id);
                setTitle(meta.title);
                setDescription(meta.description);
                setVisibility(meta.visibility);
                setPracticeEnabled(meta.is_practice_enabled);
                setMode(meta.content_format === "PDF" ? "PDF" : "DIRECT");

                const keyById: Map<string, AnswerKeyItem> = new Map<string, AnswerKeyItem>(
                    (keyDoc?.answers ?? []).map((item): [string, AnswerKeyItem] => [
                        item.question_id,
                        item
                    ])
                );
                if (meta.content_format === "JSON" && content.questions) {
                    setQuestions(
                        content.questions.map((q): EditableQuestion => {
                            const keyItem: AnswerKeyItem | undefined = keyById.get(q.id);
                            return {
                                id: q.id,
                                question_type: q.question_type,
                                prompt: q.prompt,
                                points: q.points,
                                options: q.options ?? [],
                                correct_answer:
                                    q.question_type === "MULTIPLE_CHOICE"
                                        ? Array.isArray(keyItem?.correct_answer)
                                            ? keyItem.correct_answer
                                            : []
                                        : typeof keyItem?.correct_answer === "string"
                                          ? keyItem.correct_answer
                                          : "",
                                grading_rubric: keyItem?.grading_rubric ?? ""
                            };
                        })
                    );
                } else if (keyDoc?.answers.length) {
                    setQuestions(
                        keyDoc.answers.map((ans): EditableQuestion => ({
                            id: ans.question_id,
                            question_type: ans.question_type,
                            prompt: "",
                            points: ans.points,
                            options: [],
                            correct_answer:
                                ans.question_type === "MULTIPLE_CHOICE"
                                    ? Array.isArray(ans.correct_answer)
                                        ? ans.correct_answer
                                        : []
                                    : typeof ans.correct_answer === "string"
                                      ? ans.correct_answer
                                      : "",
                            grading_rubric: ans.grading_rubric ?? ""
                        }))
                    );
                }
            } else if (!queryGroupId && manageable.length > 0) {
                setGroupId(manageable[0].id);
            }
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to load assessment editor."));
        } finally {
            setLoading(false);
        }
    }, [assessmentId, queryGroupId, user.system_role]);

    useEffect((): void => {
        void loadInitial();
    }, [loadInitial]);

    function updateQuestion(index: number, nextValue: EditableQuestion): void {
        setQuestions(
            questions.map((item: EditableQuestion, i: number): EditableQuestion =>
                i === index ? nextValue : item
            )
        );
    }

    function validate(): string {
        if (!groupId || !title.trim()) {
            return "Select a managed group and enter an assessment title.";
        }
        if (mode === "PDF" && !existing && pdfFile === null) {
            return "Select a PDF file to upload.";
        }
        if (questions.length === 0) {
            return "Add at least one question or answer key item.";
        }
        for (let i: number = 0; i < questions.length; i += 1) {
            const q: EditableQuestion = questions[i];
            if (mode === "DIRECT" && !q.prompt.trim()) {
                return `Enter a prompt for question ${i + 1}.`;
            }
            if (!Number.isFinite(q.points) || q.points < 0) {
                return `Question ${i + 1} points must be 0 or greater.`;
            }
            if (mode === "DIRECT" && (q.question_type === "SINGLE_CHOICE" || q.question_type === "MULTIPLE_CHOICE")) {
                if (q.options.length < 2 || q.options.some((opt): boolean => !opt.text.trim())) {
                    return `Question ${i + 1} needs at least two non-empty options.`;
                }
                if (q.question_type === "SINGLE_CHOICE" && typeof q.correct_answer !== "string") {
                    return `Select a correct option for question ${i + 1}.`;
                }
                if (
                    q.question_type === "SINGLE_CHOICE" &&
                    !q.options.some((opt): boolean => opt.key === q.correct_answer)
                ) {
                    return `Select a valid option key for question ${i + 1}.`;
                }
                if (
                    q.question_type === "MULTIPLE_CHOICE" &&
                    (!Array.isArray(q.correct_answer) || q.correct_answer.length === 0)
                ) {
                    return `Select at least one correct option for question ${i + 1}.`;
                }
            }
            if (mode === "PDF" && q.question_type === "SINGLE_CHOICE" && !q.correct_answer) {
                return `Select the correct option for row ${i + 1}.`;
            }
            if (
                mode === "PDF" &&
                q.question_type === "MULTIPLE_CHOICE" &&
                (!Array.isArray(q.correct_answer) || q.correct_answer.length === 0)
            ) {
                return `Select at least one correct option for row ${i + 1}.`;
            }
            if (q.question_type === "FILL_IN_THE_BLANK") {
                if (typeof q.correct_answer !== "string" || !q.correct_answer.trim()) {
                    return `Enter an expected answer for question ${i + 1}.`;
                }
            }
        }
        return "";
    }

    async function handleSave(event: FormEvent): Promise<void> {
        event.preventDefault();
        const problem: string = validate();
        if (problem) {
            setError(problem);
            return;
        }
        setBusy(true);
        setError("");
        try {
            const assessmentType: AssessmentType = deriveAssessmentType(questions);
            if (mode === "DIRECT") {
                const payloadQuestions: QuestionInput[] = questions.map(
                    (q: EditableQuestion, index: number): QuestionInput => ({
                        id: q.id,
                        order: index + 1,
                        question_type: q.question_type,
                        prompt: q.prompt.trim(),
                        points: q.points,
                        options:
                            q.question_type === "SINGLE_CHOICE" ||
                            q.question_type === "MULTIPLE_CHOICE"
                                ? q.options.map((opt) => ({
                                      key: opt.key.trim(),
                                      text: opt.text.trim()
                                  }))
                                : null,
                        correct_answer:
                            q.question_type === "ESSAY" ? null : q.correct_answer,
                        grading_rubric:
                            q.grading_rubric.trim().length > 0 ? q.grading_rubric.trim() : null
                    })
                );

                const saved: AssessmentMetadata = existing
                    ? await assessmentsApi.updateDigital(existing.id, {
                          title: title.trim(),
                          description: description.trim(),
                          assessment_type: assessmentType,
                          visibility,
                          is_practice_enabled: practiceEnabled,
                          questions: payloadQuestions
                      })
                    : await assessmentsApi.createDigital({
                          group_id: groupId,
                          title: title.trim(),
                          description: description.trim(),
                          assessment_type: assessmentType,
                          visibility,
                          is_practice_enabled: practiceEnabled,
                          questions: payloadQuestions
                      });
                navigate(`/assessments/${saved.id}`);
                return;
            }

            const answerKeyItems: AnswerKeyItem[] = questions.map(
                (q: EditableQuestion, index: number): AnswerKeyItem => ({
                    question_id: String(index + 1),
                    question_type: q.question_type,
                    points: q.points,
                    correct_answer: q.question_type === "ESSAY" ? null : q.correct_answer,
                    grading_rubric:
                        q.grading_rubric.trim().length > 0 ? q.grading_rubric.trim() : null
                })
            );

            if (existing) {
                const updated: AssessmentMetadata = await assessmentsApi.updatePdf(existing.id, {
                    title: title.trim(),
                    description: description.trim(),
                    assessment_type: assessmentType,
                    visibility,
                    is_practice_enabled: practiceEnabled,
                    file: pdfFile ?? undefined
                });
                await assessmentsApi.upsertAnswerKey(existing.id, answerKeyItems);
                navigate(`/assessments/${updated.id}`);
            } else if (pdfFile) {
                const created: AssessmentMetadata = await assessmentsApi.createPdf({
                    group_id: groupId,
                    title: title.trim(),
                    description: description.trim(),
                    assessment_type: assessmentType,
                    visibility,
                    is_practice_enabled: practiceEnabled,
                    file: pdfFile,
                    answers: answerKeyItems
                });
                navigate(`/assessments/${created.id}`);
            }
        } catch (reason: unknown) {
            setError(extractErrorMessage(reason, "Unable to save assessment."));
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return <p className="muted">Loading assessment editor...</p>;
    }
    if (!existing && managedGroups.length === 0) {
        return (
            <p className="empty">
                You must be an Owner or Moderator of a group to create assessments.
            </p>
        );
    }

    return (
        <div className="page-enter">
            <Link className="back" to={groupId ? `/groups/${groupId}` : "/groups"}>
                ← Back to group
            </Link>
            <PageTitle
                label="ASSESSMENT AUTHORING"
                title={existing ? "Edit assessment" : "Create assessment"}
                description="Assessments are private to contests inside their group unless practice mode is explicitly enabled."
            />
            <form
                className="form editor"
                onSubmit={(event): void => {
                    void handleSave(event);
                }}
            >
                <section className="panel form">
                    <h2>Assessment metadata</h2>
                    <label>
                        Owning group
                        <select
                            required
                            disabled={Boolean(existing)}
                            value={groupId}
                            onChange={(event): void => setGroupId(event.target.value)}
                        >
                            <option value="">Select managed group</option>
                            {managedGroups.map(
                                (group: GroupSummary): ReactNode => (
                                    <option value={group.id} key={group.id}>
                                        {group.name} · {group.my_role ?? "MANAGER"}
                                    </option>
                                )
                            )}
                        </select>
                    </label>
                    <label>
                        Title
                        <input
                            required
                            maxLength={255}
                            value={title}
                            onChange={(event): void => setTitle(event.target.value)}
                        />
                    </label>
                    <label>
                        Description
                        <textarea
                            rows={3}
                            maxLength={2000}
                            value={description}
                            onChange={(event): void => setDescription(event.target.value)}
                        />
                    </label>
                    <div className="two-col">
                        <label>
                            Creation mode
                            <select
                                disabled={Boolean(existing)}
                                value={mode}
                                onChange={(event): void => {
                                    setMode(event.target.value as "DIRECT" | "PDF");
                                    setError("");
                                }}
                            >
                                <option value="DIRECT">Author structured questions</option>
                                <option value="PDF">Upload PDF + answer key mapping</option>
                            </select>
                        </label>
                        <label>
                            Visibility
                            <select
                                value={visibility}
                                onChange={(event): void =>
                                    setVisibility(event.target.value as AssessmentVisibility)
                                }
                            >
                                <option value="DRAFT">Draft (managers only)</option>
                                <option value="PRIVATE">Private (group members)</option>
                                <option value="PUBLIC">Public (open within active rules)</option>
                            </select>
                        </label>
                    </div>
                    {mode === "PDF" && (
                        <label>
                            PDF document {existing ? "(optional replacement)" : "(required)"}
                            <input
                                type="file"
                                accept="application/pdf,.pdf"
                                onChange={(event): void =>
                                    setPdfFile(event.target.files?.[0] ?? null)
                                }
                            />
                        </label>
                    )}
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={practiceEnabled}
                            onChange={(event): void => setPracticeEnabled(event.target.checked)}
                        />{" "}
                        Enable standalone practice mode outside scheduled contests
                    </label>
                </section>

                <section className="panel">
                    <div className="section-heading">
                        <div>
                            <h2>{mode === "PDF" ? "Answer key mapping" : "Questions"}</h2>
                            <p className="muted">
                                Objective items are auto-graded; essay items are evaluated manually.
                            </p>
                        </div>
                    </div>
                    <div className="form">
                        {questions.map(
                            (question: EditableQuestion, index: number): ReactNode => (
                                <div className="question-editor" key={question.id}>
                                    <div className="question-top">
                                        <strong>
                                            {mode === "PDF" ? `Row ${index + 1}` : `Question ${index + 1}`}
                                        </strong>
                                        <button
                                            type="button"
                                            className="link-button"
                                            disabled={questions.length <= 1}
                                            onClick={(): void =>
                                                setQuestions(
                                                    questions.filter(
                                                        (item): boolean => item.id !== question.id
                                                    )
                                                )
                                            }
                                        >
                                            Remove
                                        </button>
                                    </div>
                                    {mode === "DIRECT" && (
                                        <label>
                                            Prompt
                                            <textarea
                                                rows={2}
                                                value={question.prompt}
                                                onChange={(event): void =>
                                                    updateQuestion(index, {
                                                        ...question,
                                                        prompt: event.target.value
                                                    })
                                                }
                                            />
                                        </label>
                                    )}
                                    <div className="two-col">
                                        <label>
                                            Question type
                                            <select
                                                value={question.question_type}
                                                onChange={(event): void => {
                                                    const nextType: QuestionType = event.target
                                                        .value as QuestionType;
                                                    const fresh: EditableQuestion =
                                                        makeEditableQuestion(nextType);
                                                    updateQuestion(index, {
                                                        ...fresh,
                                                        id: question.id,
                                                        prompt: question.prompt,
                                                        points: question.points
                                                    });
                                                }}
                                            >
                                                <option value="SINGLE_CHOICE">Single choice</option>
                                                <option value="MULTIPLE_CHOICE">
                                                    Multiple choice
                                                </option>
                                                <option value="FILL_IN_THE_BLANK">
                                                    Fill in the blank
                                                </option>
                                                <option value="ESSAY">Essay</option>
                                            </select>
                                        </label>
                                        <label>
                                            Points
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                value={question.points}
                                                onChange={(event): void =>
                                                    updateQuestion(index, {
                                                        ...question,
                                                        points: Number(event.target.value)
                                                    })
                                                }
                                            />
                                        </label>
                                    </div>
                                    {mode === "PDF" ? (
                                        question.question_type === "ESSAY" ? (
                                            <label>
                                                Grading rubric (optional)
                                                <input
                                                    value={question.grading_rubric}
                                                    onChange={(event): void =>
                                                        updateQuestion(index, {
                                                            ...question,
                                                            grading_rubric: event.target.value
                                                        })
                                                    }
                                                />
                                            </label>
                                        ) : question.question_type === "SINGLE_CHOICE" ||
                                          question.question_type === "MULTIPLE_CHOICE" ? (
                                            <div className="answer-sheet-row answer-key-row">
                                                <span className="label">Correct answer</span>
                                                <div className="answer-bubble-group">
                                                    {PDF_CHOICE_KEYS.map((key: string): ReactNode => {
                                                        const selected: string[] = Array.isArray(
                                                            question.correct_answer
                                                        )
                                                            ? question.correct_answer
                                                            : [question.correct_answer];
                                                        const active: boolean = selected.includes(key);
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={key}
                                                                aria-pressed={active}
                                                                aria-label={`Row ${index + 1} correct option ${key}`}
                                                                className={
                                                                    active
                                                                        ? "answer-bubble active"
                                                                        : "answer-bubble"
                                                                }
                                                                onClick={(): void =>
                                                                    updateQuestion(index, {
                                                                        ...question,
                                                                        correct_answer:
                                                                            question.question_type ===
                                                                            "MULTIPLE_CHOICE"
                                                                                ? active
                                                                                    ? selected.filter(
                                                                                          (k): boolean =>
                                                                                              k !== key
                                                                                      )
                                                                                    : [
                                                                                          ...selected.filter(
                                                                                              Boolean
                                                                                          ),
                                                                                          key
                                                                                      ]
                                                                                : key
                                                                    })
                                                                }
                                                            >
                                                                {key}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <label>
                                                Expected answer
                                                <input
                                                    value={
                                                        typeof question.correct_answer === "string"
                                                            ? question.correct_answer
                                                            : ""
                                                    }
                                                    onChange={(event): void =>
                                                        updateQuestion(index, {
                                                            ...question,
                                                            correct_answer: event.target.value
                                                        })
                                                    }
                                                />
                                            </label>
                                        )
                                    ) : question.question_type === "SINGLE_CHOICE" ||
                                      question.question_type === "MULTIPLE_CHOICE" ? (
                                        <div className="form">
                                            <span className="label">Options &amp; correct answer</span>
                                            {question.options.map(
                                                (option: QuestionOption, optIndex: number): ReactNode => {
                                                    const checked: boolean =
                                                        question.question_type === "SINGLE_CHOICE"
                                                            ? question.correct_answer === option.key
                                                            : Array.isArray(question.correct_answer) &&
                                                              question.correct_answer.includes(
                                                                  option.key
                                                              );
                                                    return (
                                                        <div
                                                            className="option-edit"
                                                            key={option.key}
                                                        >
                                                            <input
                                                                aria-label={`Correct answer option ${option.key}`}
                                                                type={
                                                                    question.question_type ===
                                                                    "SINGLE_CHOICE"
                                                                        ? "radio"
                                                                        : "checkbox"
                                                                }
                                                                name={`answer-${question.id}`}
                                                                checked={checked}
                                                                onChange={(event): void => {
                                                                    if (
                                                                        question.question_type ===
                                                                        "SINGLE_CHOICE"
                                                                    ) {
                                                                        updateQuestion(index, {
                                                                            ...question,
                                                                            correct_answer:
                                                                                option.key
                                                                        });
                                                                        return;
                                                                    }
                                                                    const prev: string[] =
                                                                        Array.isArray(
                                                                            question.correct_answer
                                                                        )
                                                                            ? question.correct_answer
                                                                            : [];
                                                                    updateQuestion(index, {
                                                                        ...question,
                                                                        correct_answer: event.target
                                                                            .checked
                                                                            ? [...prev, option.key]
                                                                            : prev.filter(
                                                                                  (k): boolean =>
                                                                                      k !==
                                                                                      option.key
                                                                              )
                                                                    });
                                                                }}
                                                            />
                                                            <span className="badge">
                                                                {option.key}
                                                            </span>
                                                            <input
                                                                aria-label={`Option ${option.key} text`}
                                                                value={option.text}
                                                                onChange={(event): void =>
                                                                    updateQuestion(index, {
                                                                        ...question,
                                                                        options:
                                                                            question.options.map(
                                                                                (item, i) =>
                                                                                    i === optIndex
                                                                                        ? {
                                                                                              ...item,
                                                                                              text: event
                                                                                                  .target
                                                                                                  .value
                                                                                          }
                                                                                        : item
                                                                            )
                                                                    })
                                                                }
                                                            />
                                                        </div>
                                                    );
                                                }
                                            )}
                                            <button
                                                type="button"
                                                className="button"
                                                onClick={(): void =>
                                                    updateQuestion(index, {
                                                        ...question,
                                                        options: [
                                                            ...question.options,
                                                            {
                                                                key: makeOptionKey(
                                                                    question.options.length
                                                                ),
                                                                text: ""
                                                            }
                                                        ]
                                                    })
                                                }
                                            >
                                                + Add option
                                            </button>
                                        </div>
                                    ) : question.question_type === "FILL_IN_THE_BLANK" ? (
                                        <label>
                                            Expected answer
                                            <input
                                                value={
                                                    typeof question.correct_answer === "string"
                                                        ? question.correct_answer
                                                        : ""
                                                }
                                                onChange={(event): void =>
                                                    updateQuestion(index, {
                                                        ...question,
                                                        correct_answer: event.target.value
                                                    })
                                                }
                                            />
                                        </label>
                                    ) : (
                                        <label>
                                            Grading rubric (optional)
                                            <textarea
                                                rows={2}
                                                value={question.grading_rubric}
                                                onChange={(event): void =>
                                                    updateQuestion(index, {
                                                        ...question,
                                                        grading_rubric: event.target.value
                                                    })
                                                }
                                            />
                                        </label>
                                    )}
                                </div>
                            )
                        )}
                        <button
                            type="button"
                            className="button"
                            onClick={(): void =>
                                setQuestions([...questions, makeEditableQuestion()])
                            }
                        >
                            + Add question
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
                        Save creates or increments a versioned assessment package.
                    </span>
                    <button className="button primary" disabled={busy}>
                        {busy
                            ? "Saving..."
                            : existing
                              ? "Update assessment"
                              : "Publish assessment"}
                    </button>
                </div>
            </form>
        </div>
    );
}
