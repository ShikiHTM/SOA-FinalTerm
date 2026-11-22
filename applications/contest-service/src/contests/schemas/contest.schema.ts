import { z } from "zod";
import {
    ContestPhase,
    ContestStatus,
    ContestSubmissionPolicy,
    ContestVisibility
} from "../../shared/types";

const UuidField = z.string().uuid("Must be a valid UUID.");
const IsoTimestampField = z.string().datetime({ offset: true });

const CONTEST_FIELDS = {
    title: z.string().trim().min(2).max(255),
    description: z.string().trim().max(4000),
    assessment_id: UuidField,
    visibility: z.nativeEnum(ContestVisibility),
    start_time: IsoTimestampField,
    end_time: IsoTimestampField,
    submission_policy: z.nativeEnum(ContestSubmissionPolicy),
    status: z.enum([ContestStatus.DRAFT, ContestStatus.PUBLISHED])
};

export const IdParamSchema = z.object({
    id: UuidField
});

export const SubmissionContextQuerySchema = z.object({
    user_id: UuidField
});

export const ListContestsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    group_id: UuidField.optional(),
    visibility: z.nativeEnum(ContestVisibility).optional(),
    status: z.nativeEnum(ContestStatus).optional(),
    phase: z.nativeEnum(ContestPhase).optional(),
    search: z.string().trim().max(120).optional()
});

export const CreateContestSchema = z
    .object({
        ...CONTEST_FIELDS,
        group_id: UuidField,
        description: CONTEST_FIELDS.description.default(""),
        visibility: CONTEST_FIELDS.visibility.default(ContestVisibility.PRIVATE),
        submission_policy: CONTEST_FIELDS.submission_policy.default(
            ContestSubmissionPolicy.SINGLE
        ),
        status: CONTEST_FIELDS.status.default(ContestStatus.DRAFT)
    })
    .refine(
        (data): boolean => new Date(data.start_time).getTime() < new Date(data.end_time).getTime(),
        {
            message: "start_time must precede end_time.",
            path: ["end_time"]
        }
    );

export const UpdateContestSchema = z
    .object(CONTEST_FIELDS)
    .partial()
    .refine(
        (data): boolean =>
            Object.values(data).some((value: unknown): boolean => value !== undefined),
        {
            message: "At least one field must be provided for update."
        }
    );

export const AdminStatusSchema = z
    .object({
        status: z.nativeEnum(ContestStatus),
        reason: z.string().trim().min(1).max(500).optional()
    })
    .refine(
        (data): boolean => data.status === ContestStatus.PUBLISHED || data.reason !== undefined,
        {
            message: "Moderation reason is required when hiding or cancelling a contest.",
            path: ["reason"]
        }
    );

export const AdminDeleteSchema = z.object({
    reason: z.string().trim().min(1).max(500).optional()
});

export type ListContestsQuery = z.infer<typeof ListContestsQuerySchema>;
export type CreateContestDto = z.infer<typeof CreateContestSchema>;
export type UpdateContestDto = z.infer<typeof UpdateContestSchema>;
export type AdminStatusDto = z.infer<typeof AdminStatusSchema>;
