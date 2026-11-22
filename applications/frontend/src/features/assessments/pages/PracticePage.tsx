import type { Dispatch,SetStateAction } from "react";
import { useState,type ReactNode } from "react";
import { Link,useParams } from "react-router-dom";
import { hasAccess,PageTitle,useApp } from "../../../shared/context";
import type { Assessment,Group,Question } from "../../../types";

export function Practice(): ReactNode {
    const { assessmentId }: { assessmentId?: string } = useParams();
    const { data }: ReturnType<typeof useApp> = useApp();
    const [answers, setAnswers]: [
        Record<string, string[]>,
        Dispatch<SetStateAction<Record<string, string[]>>>,
    ] = useState<Record<string, string[]>>({});
    const [done, setDone]: [boolean, Dispatch<SetStateAction<boolean>>] = useState<boolean>(false);
    const exam: Assessment | undefined = data.assessments.find(
        (item: Assessment): boolean => item.id === assessmentId,
    );
    const group: Group | undefined = data.groups.find(
        (item: Group): boolean => item.id === exam?.groupId,
    );
    if (
        !exam ||
        !group ||
        !hasAccess(group) ||
        (group.visibility !== "PUBLIC" && !exam.practice) ||
        exam.source !== "DIRECT"
    )
        return <p className="empty">Đề không khả dụng để luyện tập.</p>;
    return (
        <>
            <Link className="back" to={`/assessments/${exam.id}`}>
                ← Chi tiết đề
            </Link>
            <PageTitle
                label="LUYỆN TẬP"
                title={exam.title}
                description="Phiên thử nghiệm không nộp lên máy chủ và chưa chấm điểm."
            />
            <div className="form">
                {exam.questions.map(
                    (question: Question, index: number): ReactNode => (
                        <section className="panel" key={question.id}>
                            <p className="eyebrow">
                                CÂU {index + 1} · {question.points} ĐIỂM
                            </p>
                            <h2>{question.text}</h2>
                            {question.options.length ? (
                                <div className="form">
                                    {question.options.map(
                                        (option: string, i: number): ReactNode => (
                                            <label className="check option" key={i}>
                                                <input
                                                    type={
                                                        question.kind === "MULTIPLE"
                                                            ? "checkbox"
                                                            : "radio"
                                                    }
                                                    name={question.id}
                                                    checked={(answers[question.id] ?? []).includes(
                                                        option,
                                                    )}
                                                    onChange={(event): void => {
                                                        const previous: string[] =
                                                            answers[question.id] ?? [];
                                                        setAnswers({
                                                            ...answers,
                                                            [question.id]:
                                                                question.kind === "MULTIPLE"
                                                                    ? event.target.checked
                                                                        ? [...previous, option]
                                                                        : previous.filter(
                                                                              (
                                                                                  value: string,
                                                                              ): boolean =>
                                                                                  value !== option,
                                                                          )
                                                                    : [option],
                                                        });
                                                    }}
                                                />
                                                {option}
                                            </label>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <textarea
                                    rows={question.kind === "ESSAY" ? 5 : 2}
                                    value={answers[question.id]?.[0] ?? ""}
                                    onChange={(event): void =>
                                        setAnswers({
                                            ...answers,
                                            [question.id]: [event.target.value],
                                        })
                                    }
                                />
                            )}
                        </section>
                    ),
                )}
                {done && (
                    <p className="notice">
                        Đã hoàn thành phiên luyện tập mô phỏng. Hệ thống chưa chấm điểm.
                    </p>
                )}
                <button className="button primary" onClick={(): void => setDone(true)}>
                    Hoàn thành luyện tập
                </button>
            </div>
        </>
    );
}
