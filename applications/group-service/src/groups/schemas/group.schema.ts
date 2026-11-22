import { z } from "zod";
import {
    GroupJoinPolicy,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility,
    JoinRequestStatus
} from "../../shared/types";

const UuidField = z.string().uuid("Must be a valid UUID.");
const ReasonField = z.string().trim().min(1).max(500).optional();

const GROUP_FIELDS = {
    name: z
        .string()
        .trim()
        .min(2, "Group name must be at least 2 characters.")
        .max(150, "Group name must not exceed 150 characters."),
    description: z.string().trim().max(2000, "Description must not exceed 2000 characters."),
    visibility: z.nativeEnum(GroupVisibility),
    join_policy: z.nativeEnum(GroupJoinPolicy),
    password: z
        .string()
        .min(6, "Group password must be at least 6 characters.")
        .max(128, "Group password must not exceed 128 characters.")
        .optional()
};

export const IdParamSchema = z.object({
    id: UuidField
});

export const GroupCodeParamSchema = z.object({
    code: z
        .string()
        .trim()
        .min(4, "Group code must be at least 4 characters.")
        .max(32, "Group code must not exceed 32 characters.")
        .regex(/^[a-zA-Z0-9-]+$/, "Invalid group code format.")
        .transform((value: string): string => value.toUpperCase())
});

export const GroupUserParamSchema = IdParamSchema.extend({
    userId: UuidField
});

export const GroupRequestParamSchema = IdParamSchema.extend({
    requestId: UuidField
});

export const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const ListGroupsQuerySchema = PaginationQuerySchema.extend({
    search: z.string().trim().max(120).optional(),
    visibility: z.nativeEnum(GroupVisibility).optional(),
    status: z.nativeEnum(GroupStatus).optional()
});

export const ListMembersQuerySchema = PaginationQuerySchema.extend({
    role: z.nativeEnum(GroupMemberRole).optional()
});

export const ListJoinRequestsQuerySchema = PaginationQuerySchema.extend({
    status: z.nativeEnum(JoinRequestStatus).optional()
});

export const CreateGroupSchema = z.object({
    ...GROUP_FIELDS,
    description: GROUP_FIELDS.description.default("")
});

export const UpdateGroupSettingsSchema = z
    .object(GROUP_FIELDS)
    .partial()
    .refine(
        (data): boolean =>
            Object.values(data).some((value: unknown): boolean => value !== undefined),
        {
            message: "At least one field must be provided for update."
        }
    );

export const JoinGroupSchema = z.object({
    password: z.string().min(1).max(128).optional()
});

export const ReviewJoinRequestSchema = z.object({
    decision: z.enum([JoinRequestStatus.APPROVED, JoinRequestStatus.REJECTED])
});

export const BanMemberSchema = z.object({
    user_id: UuidField,
    reason: ReasonField
});

export const UpdateMemberRoleSchema = z.object({
    role: z.enum([GroupMemberRole.MEMBER, GroupMemberRole.MODERATOR])
});

export const TransferOwnershipSchema = z.object({
    new_owner_id: UuidField
});

export const AdminStatusSchema = z
    .object({
        status: z.nativeEnum(GroupStatus),
        reason: ReasonField
    })
    .refine((data): boolean => data.status === GroupStatus.ACTIVE || data.reason !== undefined, {
        message: "Moderation reason is required when suspending a group.",
        path: ["reason"]
    });

export const AdminDeleteSchema = z.object({
    reason: ReasonField
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type ListGroupsQuery = z.infer<typeof ListGroupsQuerySchema>;
export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>;
export type ListJoinRequestsQuery = z.infer<typeof ListJoinRequestsQuerySchema>;
export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupSettingsDto = z.infer<typeof UpdateGroupSettingsSchema>;
export type BanMemberDto = z.infer<typeof BanMemberSchema>;
export type AdminStatusDto = z.infer<typeof AdminStatusSchema>;
