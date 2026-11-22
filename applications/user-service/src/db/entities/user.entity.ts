import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { UserStatus, UserSystemRole } from "../../shared/types";

export const UserSchema = defineEntity({
    name: "User",
    tableName: "users",
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        email: p.string().length(255).unique(),
        username: p.string().length(64).unique(),
        passwordHash: p.string().length(255).fieldName("password_hash").nullable(),
        displayName: p.string().length(120).fieldName("display_name"),
        bio: p.text().nullable(),
        avatarUrl: p.text().fieldName("avatar_url").nullable(),
        privacySettings: p
            .json<Record<string, unknown>>()
            .fieldName("privacy_settings")
            .defaultRaw("'{}'::jsonb")
            .onCreate((): Record<string, unknown> => ({})),
        systemRole: p
            .enum((): typeof UserSystemRole => UserSystemRole)
            .nativeEnumName("user_system_role")
            .fieldName("system_role")
            .default(UserSystemRole.USER)
            .index("idx_users_role"),
        status: p
            .enum((): typeof UserStatus => UserStatus)
            .nativeEnumName("user_status")
            .default(UserStatus.ACTIVE)
            .index("idx_users_status"),
        moderationReason: p.text().fieldName("moderation_reason").nullable(),
        moderatedBy: p.uuid().fieldName("moderated_by").nullable(),
        moderatedAt: p.datetime().columnType("timestamptz").fieldName("moderated_at").nullable(),
        deletedAt: p.datetime().columnType("timestamptz").fieldName("deleted_at").nullable(),
        createdAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("created_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date()),
        updatedAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("updated_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date())
            .onUpdate((): Date => new Date())
    }
});

export type UserEntity = InferEntity<typeof UserSchema>;
