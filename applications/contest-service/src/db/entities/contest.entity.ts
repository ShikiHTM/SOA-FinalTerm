import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import {
    ContestStatus,
    ContestSubmissionPolicy,
    ContestVisibility
} from "../../shared/types";

export const ContestSchema = defineEntity({
    name: "Contest",
    tableName: "contests",
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        groupId: p.uuid().fieldName("group_id").index("idx_contests_group_id"),
        assessmentId: p.uuid().fieldName("assessment_id").index("idx_contests_assessment_id"),
        assessmentVersion: p.integer().fieldName("assessment_version").default(1),
        organizerId: p.uuid().fieldName("organizer_id").index("idx_contests_organizer_id"),
        title: p.string().length(255),
        description: p.text().default(""),
        visibility: p
            .enum((): typeof ContestVisibility => ContestVisibility)
            .nativeEnumName("contest_visibility")
            .default(ContestVisibility.PRIVATE)
            .index("idx_contests_visibility"),
        startTime: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("start_time")
            .index("idx_contests_start_time"),
        endTime: p.datetime().columnType("timestamptz").fieldName("end_time"),
        submissionPolicy: p
            .enum((): typeof ContestSubmissionPolicy => ContestSubmissionPolicy)
            .nativeEnumName("contest_submission_policy")
            .fieldName("submission_policy")
            .default(ContestSubmissionPolicy.SINGLE),
        status: p
            .enum((): typeof ContestStatus => ContestStatus)
            .nativeEnumName("contest_status")
            .default(ContestStatus.DRAFT)
            .index("idx_contests_status"),
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

export type ContestEntity = InferEntity<typeof ContestSchema>;
