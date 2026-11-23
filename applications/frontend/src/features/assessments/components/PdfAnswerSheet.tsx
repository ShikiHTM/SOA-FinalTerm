import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type { SubmittedAnswerInput } from "../../../api/types";

export const PDF_CHOICE_KEYS: string[] = ["A", "B", "C", "D"];
const FALLBACK_ROW_COUNT: number = 20;

export type PdfAnswerMap = Record<string, string | string[]>;

export function pdfRowIds(questionCount: number | null | undefined): string[] {
    const count: number = questionCount && questionCount > 0 ? questionCount : FALLBACK_ROW_COUNT;
    return Array.from({ length: count }, (_: unknown, index: number): string => String(index + 1));
}

export function buildPdfAnswers(rowIds: string[], answers: PdfAnswerMap): SubmittedAnswerInput[] {
    return rowIds.map((id: string): SubmittedAnswerInput => {
        const value: string | string[] | undefined = answers[id];
        return { question_id: id, student_response: typeof value === "string" ? value : "" };
    });
}

export function countPdfAnswered(rowIds: string[], answers: PdfAnswerMap): number {
    return rowIds.filter((id: string): boolean => typeof answers[id] === "string" && answers[id] !== "")
        .length;
}

interface PdfAnswerSheetProps {
    pdfUrl: string | null;
    title: string;
    rowIds: string[];
    answers: PdfAnswerMap;
    onChange: (answers: PdfAnswerMap) => void;
    footer: ReactNode;
}

export function PdfAnswerSheet({
    pdfUrl,
    title,
    rowIds,
    answers,
    onChange,
    footer
}: PdfAnswerSheetProps): ReactNode {
    const answered: number = countPdfAnswered(rowIds, answers);

    return (
        <div className="pdf-attempt-split">
            <section className="panel pdf-viewer-pane">
                <div className="pdf-pane-header">
                    <h2>Exam paper</h2>
                    {pdfUrl && (
                        <a className="link-button" href={pdfUrl} target="_blank" rel="noreferrer">
                            Open in new tab <ExternalLink size={13} />
                        </a>
                    )}
                </div>
                {pdfUrl ? (
                    <iframe className="pdf-viewer-frame" src={pdfUrl} title={title} />
                ) : (
                    <p className="empty">The exam document is not available.</p>
                )}
            </section>

            <section className="panel pdf-answersheet-pane">
                <div className="pdf-pane-header">
                    <h2>Answer sheet</h2>
                    <span className="badge">
                        {answered}/{rowIds.length}
                    </span>
                </div>
                <ol className="answer-sheet-rows">
                    {rowIds.map(
                        (id: string): ReactNode => (
                            <li className="answer-sheet-row" key={id}>
                                <span className="answer-sheet-num">{id}</span>
                                <div className="answer-bubble-group" role="radiogroup" aria-label={`Question ${id}`}>
                                    {PDF_CHOICE_KEYS.map((key: string): ReactNode => {
                                        const active: boolean = answers[id] === key;
                                        return (
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                aria-label={`Question ${id} option ${key}`}
                                                className={active ? "answer-bubble active" : "answer-bubble"}
                                                key={key}
                                                onClick={(): void =>
                                                    onChange({ ...answers, [id]: active ? "" : key })
                                                }
                                            >
                                                {key}
                                            </button>
                                        );
                                    })}
                                </div>
                            </li>
                        )
                    )}
                </ol>
                <div className="pdf-answersheet-footer">{footer}</div>
            </section>
        </div>
    );
}
