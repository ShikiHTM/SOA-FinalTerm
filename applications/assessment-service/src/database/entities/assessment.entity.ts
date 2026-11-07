import { defineEntity, type InferEntity, p } from "@mikro-orm/postgresql";
import { v4 } from "uuid"

export const AssessmentSchema = defineEntity({
  name: "assessment",
  properties: {
    id: p.uuid().primary().onCreate(() => v4()),
    title: p.string(),
    created_at: p.datetime()
      .onCreate(() => new Date()),
    updated_at: p.datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
    version: p.integer().version()
  }
})

export type IAssessment = InferEntity<typeof AssessmentSchema>;
