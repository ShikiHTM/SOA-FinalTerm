import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { JoinRequestStatus } from "../../shared/types";
import { GroupSchema } from "./group.entity";

export const GroupJoinRequestSchema = defineEntity({
    name: "GroupJoinRequest",
    tableName: "group_join_requests",
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        group: p
            .manyToOne(GroupSchema)
            .fieldName("group_id")
            .deleteRule("cascade")
            .index("idx_join_requests_group_id"),
        userId: p.uuid().fieldName("user_id").index("idx_join_requests_user_id"),
        status: p
            .enum((): typeof JoinRequestStatus => JoinRequestStatus)
            .nativeEnumName("join_request_status")
            .default(JoinRequestStatus.PENDING),
        reviewedBy: p.uuid().fieldName("reviewed_by").nullable(),
        reviewedAt: p.datetime().columnType("timestamptz").fieldName("reviewed_at").nullable(),
        createdAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("created_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date())
    }
});

export type GroupJoinRequestEntity = InferEntity<typeof GroupJoinRequestSchema>;
