import { z } from "zod";
import {
    AssessmentStatus,
    AssessmentType,
    AssessmentVisibility,
    QuestionType
} from "../../shared/types";

const BooleanInput = z.union([
    z.boolean(),
    z.enum(["true", "false"]).transform((value: "true" | "false"): boolean => value === "true")
]);

const CorrectAnswerSchema = z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1)
]).nullable().optional();

function isValidAnswerForQuestionType(data: {
    question_type: QuestionType;
    correct_answer?: string | string[] | null;
}): boolean {
    return data.question_type !== QuestionType.ESSAY || data.correct_answer == null;
}

const ASSESSMENT_FIELDS = {
    title: z.string().trim().min(1, "Assessment title is required.").max(255),
    description: z.string().trim().max(2000).default(""),
    assessment_type: z.nativeEnum(AssessmentType),
    visibility: z.nativeEnum(AssessmentVisibility).default(AssessmentVisibility.DRAFT),
    is_practice_enabled: BooleanInput.default(false)
};

export const IdParamSchema = z.object({
    id: z.string().uuid("Assessment ID must be a valid UUID.")
});

export const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const ListAssessmentsQuerySchema = PaginationQuerySchema.extend({
    group_id: z.string().uuid().optional(),
    status: z.nativeEnum(AssessmentStatus).optional(),
    visibility: z.nativeEnum(AssessmentVisibility).optional(),
    is_practice_enabled: BooleanInput.optional(),
    search: z.string().trim().max(120).optional()
});

export const GroupAssessmentsQuerySchema = ListAssessmentsQuerySchema.extend({
    group_id: z.string().uuid("Group ID must be a valid UUID.")
});

export const GradingDataQuerySchema = z.object({
    version: z.coerce.number().int().min(1).optional()
});

export const QuestionOptionSchema = z.object({
    key: z.string().trim().min(1).max(16),
    text: z.string().trim().min(1).max(1000)
});

export const QuestionSchema = z.object({
    id: z.string().trim().min(1).max(100),
    order: z.number().int().min(1),
    question_type: z.nativeEnum(QuestionType),
    prompt: z.string().trim().min(1).max(10000),
    points: z.number().min(0).max(1000),
    options: z.array(QuestionOptionSchema).nullable().optional(),
    correct_answer: CorrectAnswerSchema,
    grading_rubric: z.string().trim().max(4000).nullable().optional()
}).refine(isValidAnswerForQuestionType, {
    message: "ESSAY questions cannot define an auto-graded correct_answer.",
    path: ["correct_answer"]
});

export const AnswerKeyItemSchema = z.object({
    question_id: z.string().trim().min(1).max(100),
    question_type: z.nativeEnum(QuestionType),
    points: z.number().min(0).max(1000),
    correct_answer: CorrectAnswerSchema,
    grading_rubric: z.string().trim().max(4000).nullable().optional()
}).refine(isValidAnswerForQuestionType, {
    message: "ESSAY items cannot define an auto-graded correct_answer.",
    path: ["correct_answer"]
});

export const CreateDigitalAssessmentSchema = z.object({
    ...ASSESSMENT_FIELDS,
    group_id: z.string().uuid("Group ID must be a valid UUID."),
    questions: z.array(QuestionSchema).min(1).max(200)
});

export const CreatePdfAssessmentSchema = z.object({
    ...ASSESSMENT_FIELDS,
    group_id: z.string().uuid("Group ID must be a valid UUID."),
    answers: z.string().optional()
});

export const UpdateAssessmentSchema = z.object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(2000).optional(),
    assessment_type: z.nativeEnum(AssessmentType).optional(),
    visibility: z.nativeEnum(AssessmentVisibility).optional(),
    is_practice_enabled: BooleanInput.optional(),
    questions: z.array(QuestionSchema).min(1).max(200).optional()
});

export const UpsertAnswerKeySchema = z.object({
    answers: z.array(AnswerKeyItemSchema).min(1).max(200)
});

export const AdminStatusSchema = z.object({
    status: z.nativeEnum(AssessmentStatus),
    reason: z.string().trim().min(1).max(500).optional()
}).refine(
    (data): boolean => data.status === AssessmentStatus.ACTIVE || data.reason !== undefined,
    {
        message: "Moderation reason is required when hiding an assessment.",
        path: ["reason"]
    }
);

export const AdminDeleteSchema = z.object({
    reason: z.string().trim().min(1).max(500).optional()
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type ListAssessmentsQuery = z.infer<typeof ListAssessmentsQuerySchema>;
export type GroupAssessmentsQuery = z.infer<typeof GroupAssessmentsQuerySchema>;
export type QuestionOptionDto = z.infer<typeof QuestionOptionSchema>;
export type QuestionInput = z.infer<typeof QuestionSchema>;
export type AnswerKeyItem = z.infer<typeof AnswerKeyItemSchema>;
export type CreateDigitalAssessmentDto = z.infer<typeof CreateDigitalAssessmentSchema>;
export type CreatePdfAssessmentDto = z.infer<typeof CreatePdfAssessmentSchema>;
export type UpdateAssessmentDto = z.infer<typeof UpdateAssessmentSchema>;
export type UpsertAnswerKeyDto = z.infer<typeof UpsertAnswerKeySchema>;
export type AdminStatusDto = z.infer<typeof AdminStatusSchema>;
export type AdminDeleteDto = z.infer<typeof AdminDeleteSchema>;
