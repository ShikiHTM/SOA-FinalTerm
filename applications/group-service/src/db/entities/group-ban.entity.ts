import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { GroupSchema } from "./group.entity";

export const GroupBanSchema = defineEntity({
    name: "GroupBan",
    tableName: "group_bans",
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        group: p
            .manyToOne(GroupSchema)
            .fieldName("group_id")
            .deleteRule("cascade")
            .index("idx_group_bans_group_id"),
        userId: p.uuid().fieldName("user_id").index("idx_group_bans_user_id"),
        reason: p.text().nullable(),
        bannedBy: p.uuid().fieldName("banned_by"),
        bannedAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("banned_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date()),
        revokedAt: p.datetime().columnType("timestamptz").fieldName("revoked_at").nullable()
    }
});

export type GroupBanEntity = InferEntity<typeof GroupBanSchema>;
