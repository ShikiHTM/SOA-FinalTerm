import { z } from "zod";
import {
    GroupJoinPolicy,
    GroupMemberRole,
    GroupStatus,
    GroupVisibility,
    JoinRequestStatus
} from "../../shared/types";

export const GroupIdParamSchema = z.object({
    id: z.string().uuid("Group ID must be a valid UUID.")
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

export const GroupUserParamSchema = z.object({
    id: z.string().uuid("Group ID must be a valid UUID."),
    userId: z.string().uuid("User ID must be a valid UUID.")
});

export const GroupRequestParamSchema = z.object({
    id: z.string().uuid("Group ID must be a valid UUID."),
    requestId: z.string().uuid("Request ID must be a valid UUID.")
});

export const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const ListGroupsQuerySchema = PaginationQuerySchema.extend({
    search: z.string().trim().max(120).optional(),
    visibility: z.nativeEnum(GroupVisibility).optional()
});

export const ListMembersQuerySchema = PaginationQuerySchema.extend({
    role: z.nativeEnum(GroupMemberRole).optional()
});

export const ListJoinRequestsQuerySchema = PaginationQuerySchema.extend({
    status: z.nativeEnum(JoinRequestStatus).optional()
});

export const AdminListGroupsQuerySchema = PaginationQuerySchema.extend({
    search: z.string().trim().max(120).optional(),
    status: z.nativeEnum(GroupStatus).optional(),
    visibility: z.nativeEnum(GroupVisibility).optional()
});

export const CreateGroupSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Group name must be at least 2 characters.")
            .max(150, "Group name must not exceed 150 characters."),
        description: z
            .string()
            .trim()
            .max(2000, "Description must not exceed 2000 characters.")
            .default(""),
        visibility: z.nativeEnum(GroupVisibility),
        join_policy: z.nativeEnum(GroupJoinPolicy),
        password: z
            .string()
            .min(6, "Group password must be at least 6 characters.")
            .max(128, "Group password must not exceed 128 characters.")
            .optional()
    })
    .superRefine((data, ctx): void => {
        if (data.visibility === GroupVisibility.PUBLIC && data.join_policy !== GroupJoinPolicy.OPEN) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["join_policy"],
                message: "Public groups must use OPEN join policy."
            });
        }
        if (data.visibility === GroupVisibility.PUBLIC && data.password !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["password"],
                message: "Public groups cannot specify a password."
            });
        }
        if (
            data.visibility === GroupVisibility.PRIVATE &&
            data.join_policy === GroupJoinPolicy.OPEN
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["join_policy"],
                message: "Private groups must use APPROVAL or PASSWORD join policy."
            });
        }
        if (data.join_policy === GroupJoinPolicy.PASSWORD && !data.password) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["password"],
                message: "Password is required for PASSWORD join policy."
            });
        }
        if (data.join_policy === GroupJoinPolicy.APPROVAL && data.password !== undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["password"],
                message: "Password cannot be set for APPROVAL join policy."
            });
        }
    });

export const UpdateGroupSettingsSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Group name must be at least 2 characters.")
            .max(150, "Group name must not exceed 150 characters.")
            .optional(),
        description: z
            .string()
            .trim()
            .max(2000, "Description must not exceed 2000 characters.")
            .optional(),
        visibility: z.nativeEnum(GroupVisibility).optional(),
        join_policy: z.nativeEnum(GroupJoinPolicy).optional(),
        password: z
            .string()
            .min(6, "Group password must be at least 6 characters.")
            .max(128, "Group password must not exceed 128 characters.")
            .optional()
    })
    .refine(
        (data): boolean =>
            data.name !== undefined ||
            data.description !== undefined ||
            data.visibility !== undefined ||
            data.join_policy !== undefined ||
            data.password !== undefined,
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
    user_id: z.string().uuid("User ID must be a valid UUID."),
    reason: z
        .string()
        .trim()
        .min(1, "Ban reason cannot be empty.")
        .max(500, "Ban reason must not exceed 500 characters.")
        .optional()
});

export const UpdateMemberRoleSchema = z.object({
    role: z.enum([GroupMemberRole.MEMBER, GroupMemberRole.MODERATOR])
});

export const TransferOwnershipSchema = z.object({
    new_owner_id: z.string().uuid("New owner ID must be a valid UUID.")
});

export const AdminUpdateGroupStatusSchema = z
    .object({
        status: z.nativeEnum(GroupStatus),
        reason: z
            .string()
            .trim()
            .min(1, "Moderation reason cannot be empty.")
            .max(500, "Moderation reason must not exceed 500 characters.")
            .optional()
    })
    .refine((data): boolean => data.status === GroupStatus.ACTIVE || data.reason !== undefined, {
        message: "Moderation reason is required when suspending a group.",
        path: ["reason"]
    });

export const AdminDeleteGroupSchema = z.object({
    reason: z
        .string()
        .trim()
        .min(1, "Moderation reason cannot be empty.")
        .max(500, "Moderation reason must not exceed 500 characters.")
        .optional()
});

export type GroupIdParamDto = z.infer<typeof GroupIdParamSchema>;
export type GroupCodeParamDto = z.infer<typeof GroupCodeParamSchema>;
export type GroupUserParamDto = z.infer<typeof GroupUserParamSchema>;
export type GroupRequestParamDto = z.infer<typeof GroupRequestParamSchema>;
export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;
export type ListGroupsQueryDto = z.infer<typeof ListGroupsQuerySchema>;
export type ListMembersQueryDto = z.infer<typeof ListMembersQuerySchema>;
export type ListJoinRequestsQueryDto = z.infer<typeof ListJoinRequestsQuerySchema>;
export type AdminListGroupsQueryDto = z.infer<typeof AdminListGroupsQuerySchema>;
export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupSettingsDto = z.infer<typeof UpdateGroupSettingsSchema>;
export type JoinGroupDto = z.infer<typeof JoinGroupSchema>;
export type ReviewJoinRequestDto = z.infer<typeof ReviewJoinRequestSchema>;
export type BanMemberDto = z.infer<typeof BanMemberSchema>;
export type UpdateMemberRoleDto = z.infer<typeof UpdateMemberRoleSchema>;
export type TransferOwnershipDto = z.infer<typeof TransferOwnershipSchema>;
export type AdminUpdateGroupStatusDto = z.infer<typeof AdminUpdateGroupStatusSchema>;
export type AdminDeleteGroupDto = z.infer<typeof AdminDeleteGroupSchema>;
