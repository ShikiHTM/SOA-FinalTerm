import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { GroupJoinPolicy, GroupStatus, GroupVisibility } from "../../shared/types";

export const GroupSchema = defineEntity({
    name: "Group",
    tableName: "groups",
    checks: [
        {
            name: "chk_groups_visibility_join_policy",
            expression:
                "(visibility = 'PUBLIC' AND join_policy = 'OPEN' AND join_password_hash IS NULL) OR (visibility = 'PRIVATE' AND join_policy = 'APPROVAL' AND join_password_hash IS NULL) OR (visibility = 'PRIVATE' AND join_policy = 'PASSWORD' AND join_password_hash IS NOT NULL)"
        }
    ],
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        groupCode: p.string().length(32).fieldName("group_code").unique(),
        name: p.string().length(150),
        description: p.text().default(""),
        visibility: p
            .enum((): typeof GroupVisibility => GroupVisibility)
            .nativeEnumName("group_visibility")
            .index("idx_groups_visibility"),
        joinPolicy: p
            .enum((): typeof GroupJoinPolicy => GroupJoinPolicy)
            .nativeEnumName("group_join_policy")
            .fieldName("join_policy"),
        joinPasswordHash: p.string().length(255).fieldName("join_password_hash").nullable(),
        ownerId: p.uuid().fieldName("owner_id").index("idx_groups_owner_id"),
        status: p
            .enum((): typeof GroupStatus => GroupStatus)
            .nativeEnumName("group_status")
            .default(GroupStatus.ACTIVE)
            .index("idx_groups_status"),
        moderationReason: p.text().fieldName("moderation_reason").nullable(),
        moderatedBy: p.uuid().fieldName("moderated_by").nullable(),
        moderatedAt: p.datetime().columnType("timestamptz").fieldName("moderated_at").nullable(),
        deletedAt: p.datetime().columnType("timestamptz").fieldName("deleted_at").nullable(),
        deletedBy: p.uuid().fieldName("deleted_by").nullable(),
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

export type GroupEntity = InferEntity<typeof GroupSchema>;
