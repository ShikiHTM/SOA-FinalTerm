import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { v4 } from "uuid";
import { OAuthProvider } from "../../shared/types";
import { UserSchema } from "./user.entity";

export const UserOAuthAccountSchema = defineEntity({
    name: "UserOAuthAccount",
    tableName: "user_oauth_accounts",
    uniques: [
        {
            properties: ["provider", "providerAccountId"],
            name: "uq_oauth_provider_account"
        }
    ],
    properties: {
        id: p.uuid().primary().onCreate((): string => v4()),
        user: p
            .manyToOne(UserSchema)
            .fieldName("user_id")
            .deleteRule("cascade")
            .index("idx_oauth_user_id"),
        provider: p
            .enum((): typeof OAuthProvider => OAuthProvider)
            .nativeEnumName("oauth_provider"),
        providerAccountId: p.string().length(255).fieldName("provider_account_id"),
        providerEmail: p.string().length(255).fieldName("provider_email").nullable(),
        linkedAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("linked_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date())
    }
});

export type UserOAuthAccountEntity = InferEntity<typeof UserOAuthAccountSchema>;
