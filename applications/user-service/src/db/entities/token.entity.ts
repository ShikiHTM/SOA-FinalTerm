import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { UserSchema } from "./user.entity";

export const TokenSchema = defineEntity({
    name: "Token",
    tableName: "tokens",
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        user: p
            .manyToOne(UserSchema)
            .fieldName("user_id")
            .deleteRule("cascade")
            .index("idx_tokens_user_id"),
        tokenHash: p.string().length(255).fieldName("token_hash").unique(),
        expiresAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("expires_at")
            .index("idx_tokens_expires_at"),
        createdAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("created_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date())
    }
});

export type TokenEntity = InferEntity<typeof TokenSchema>;
