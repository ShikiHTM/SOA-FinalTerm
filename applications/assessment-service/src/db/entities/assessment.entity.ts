import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import {
    AssessmentContentFormat,
    AssessmentCreationMode,
    AssessmentStatus,
    AssessmentType,
    AssessmentVisibility
} from "../../shared/types";

export const AssessmentSchema = defineEntity({
    name: "Assessment",
    tableName: "assessments",
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        groupId: p.uuid().fieldName("group_id").index("idx_assessments_group_id"),
        createdBy: p.uuid().fieldName("created_by").index("idx_assessments_created_by"),
        title: p.string().length(255),
        description: p.text().default(""),
        assessmentType: p
            .enum((): typeof AssessmentType => AssessmentType)
            .nativeEnumName("assessment_type")
            .fieldName("assessment_type"),
        creationMode: p
            .enum((): typeof AssessmentCreationMode => AssessmentCreationMode)
            .nativeEnumName("assessment_creation_mode")
            .fieldName("creation_mode"),
        contentFormat: p
            .enum((): typeof AssessmentContentFormat => AssessmentContentFormat)
            .nativeEnumName("assessment_content_format")
            .fieldName("content_format"),
        contentS3Key: p.text().fieldName("content_s3_key"),
        answerKeyS3Key: p.text().fieldName("answer_key_s3_key").nullable(),
        version: p.integer().default(1),
        questionCount: p.integer().fieldName("question_count").default(0),
        totalPoints: p
            .decimal("number")
            .precision(10)
            .scale(2)
            .fieldName("total_points")
            .default(0),
        hasEssayItems: p.boolean().fieldName("has_essay_items").default(false),
        isPracticeEnabled: p.boolean().fieldName("is_practice_enabled").default(false),
        visibility: p
            .enum((): typeof AssessmentVisibility => AssessmentVisibility)
            .nativeEnumName("assessment_visibility")
            .default(AssessmentVisibility.DRAFT)
            .index("idx_assessments_visibility"),
        status: p
            .enum((): typeof AssessmentStatus => AssessmentStatus)
            .nativeEnumName("assessment_status")
            .default(AssessmentStatus.ACTIVE)
            .index("idx_assessments_status"),
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

export type AssessmentEntity = InferEntity<typeof AssessmentSchema>;
