import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { GroupMemberRole } from "../../shared/types";
import { GroupSchema } from "./group.entity";

export const GroupMemberSchema = defineEntity({
    name: "GroupMember",
    tableName: "group_members",
    properties: {
        group: p
            .manyToOne(GroupSchema)
            .primary()
            .fieldName("group_id")
            .deleteRule("cascade"),
        userId: p
            .uuid()
            .primary()
            .fieldName("user_id")
            .index("idx_group_members_user_id"),
        role: p
            .enum((): typeof GroupMemberRole => GroupMemberRole)
            .nativeEnumName("group_member_role")
            .default(GroupMemberRole.MEMBER),
        joinedAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("joined_at")
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

export type GroupMemberEntity = InferEntity<typeof GroupMemberSchema>;
