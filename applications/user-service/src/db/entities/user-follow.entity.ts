import { defineEntity, p, type InferEntity } from "@mikro-orm/postgresql";
import { UserSchema } from "./user.entity";

export const UserFollowSchema = defineEntity({
    name: "UserFollow",
    tableName: "user_follows",
    checks: [
        {
            name: "chk_user_follows_no_self",
            expression: "follower_id <> followee_id"
        }
    ],
    properties: {
        follower: p
            .manyToOne(UserSchema)
            .primary()
            .fieldName("follower_id")
            .deleteRule("cascade"),
        followee: p
            .manyToOne(UserSchema)
            .primary()
            .fieldName("followee_id")
            .deleteRule("cascade")
            .index("idx_user_follows_followee"),
        createdAt: p
            .datetime()
            .columnType("timestamptz")
            .fieldName("created_at")
            .defaultRaw("now()")
            .onCreate((): Date => new Date())
    }
});

export type UserFollowEntity = InferEntity<typeof UserFollowSchema>;
