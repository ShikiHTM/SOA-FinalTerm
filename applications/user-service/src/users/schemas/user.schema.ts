import { z } from "zod";
import { UserStatus, UserSystemRole } from "../../shared/types";

const UsernameField = z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(64, "Username must not exceed 64 characters.")
    .regex(
        /^[a-zA-Z0-9_.-]+$/,
        "Username may only contain letters, numbers, dots, underscores, and hyphens."
    );

export const IdParamSchema = z.object({
    id: z.string().uuid("User ID must be a valid UUID.")
});

export const UsernameParamSchema = z.object({
    username: UsernameField
});

export const UpdateProfileSchema = z
    .object({
        display_name: z
            .string()
            .trim()
            .min(1, "Display name cannot be empty.")
            .max(120, "Display name must not exceed 120 characters.")
            .optional(),
        username: UsernameField.optional(),
        bio: z
            .string()
            .trim()
            .max(500, "Bio must not exceed 500 characters.")
            .nullable()
            .optional(),
        avatar_url: z
            .string()
            .url("Valid avatar URL is required.")
            .max(2048, "Avatar URL must not exceed 2048 characters.")
            .nullable()
            .optional(),
        privacy_settings: z
            .object({
                show_email: z.boolean().optional(),
                show_bio: z.boolean().optional(),
                show_followers: z.boolean().optional(),
                show_following: z.boolean().optional()
            })
            .optional()
    })
    .refine(
        (data): boolean =>
            Object.values(data).some((value: unknown): boolean => value !== undefined),
        {
            message: "At least one field must be provided for update."
        }
    );

export const ChangePasswordSchema = z.object({
    current_password: z.string().min(1, "Current password is required.").max(128),
    new_password: z
        .string()
        .min(8, "New password must be at least 8 characters.")
        .max(128, "New password must not exceed 128 characters.")
        .regex(/[A-Z]/, "New password must include at least one uppercase letter.")
        .regex(/[a-z]/, "New password must include at least one lowercase letter.")
        .regex(/[0-9]/, "New password must include at least one digit.")
});

export const PaginationQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
});

export const ListUsersQuerySchema = PaginationQuerySchema.extend({
    search: z.string().trim().max(120).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    role: z.nativeEnum(UserSystemRole).optional()
});

export const UpdateUserStatusSchema = z
    .object({
        status: z.nativeEnum(UserStatus),
        reason: z
            .string()
            .trim()
            .min(1, "Moderation reason cannot be empty.")
            .max(500, "Moderation reason must not exceed 500 characters.")
            .optional()
    })
    .refine(
        (data): boolean => data.status === UserStatus.ACTIVE || data.reason !== undefined,
        {
            message: "Moderation reason is required when suspending or banning a user.",
            path: ["reason"]
        }
    );

export const UpdateUserRoleSchema = z.object({
    system_role: z.nativeEnum(UserSystemRole)
});

export const BatchUsersSchema = z.object({
    user_ids: z
        .array(z.string().uuid("Each user ID must be a valid UUID."))
        .min(1, "At least one user ID is required.")
        .max(100, "At most 100 user IDs are allowed.")
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type UpdateUserStatusDto = z.infer<typeof UpdateUserStatusSchema>;
