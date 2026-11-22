import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { AssessmentSchema } from "./assessment.entity";

export const AssessmentFavoriteSchema = defineEntity({
    name: "AssessmentFavorite",
    tableName: "assessment_favorites",
    properties: {
        userId: p
            .uuid()
            .primary()
            .fieldName("user_id")
            .index("idx_assessment_favorites_user_id"),
        assessment: p
            .manyToOne(AssessmentSchema)
            .primary()
            .fieldName("assessment_id")
            .deleteRule("cascade")
            .index("idx_assessment_favorites_assessment_id"),
        createdAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("created_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date())
    }
});

export type AssessmentFavoriteEntity = InferEntity<typeof AssessmentFavoriteSchema>;
