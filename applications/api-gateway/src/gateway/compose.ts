import type { UserSummary } from "../shared/types";
import {
    buildUpstreamHeaders,
    fetchOptionalJson,
    fetchUsersMap,
    type ComposeContext
} from "./proxy";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStringField(obj: JsonObject, key: string): string | null {
    const value: unknown = obj[key];
    return typeof value === "string" && value.length > 0 ? value : null;
}

function getPaginatedItems(payload: unknown): JsonObject[] | null {
    if (!isJsonObject(payload) || !Array.isArray(payload.items)) {
        return null;
    }
    return payload.items.filter(isJsonObject);
}

function resolveFirstAnswerGraderId(record: JsonObject): string | null {
    const directGraderId: string | null = getStringField(record, "graded_by");
    if (directGraderId !== null) {
        return directGraderId;
    }
    if (!Array.isArray(record.answers)) {
        return null;
    }
    for (const answer of record.answers) {
        if (isJsonObject(answer)) {
            const graderId: string | null = getStringField(answer, "grader_id");
            if (graderId !== null) {
                return graderId;
            }
        }
    }
    return null;
}

export async function composeGroup(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    if (!isJsonObject(payload)) {
        return payload;
    }
    const ownerId: string | null = getStringField(payload, "owner_id");
    const usersMap: Map<string, UserSummary> = await fetchUsersMap([ownerId], ctx.env);
    return {
        ...payload,
        owner: ownerId ? (usersMap.get(ownerId) ?? null) : null
    };
}

export async function composeGroupList(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const ownerIds: Array<string | null> = items.map((item: JsonObject): string | null =>
        getStringField(item, "owner_id")
    );
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(ownerIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            const ownerId: string | null = getStringField(item, "owner_id");
            return {
                ...item,
                owner: ownerId ? (usersMap.get(ownerId) ?? null) : null
            };
        })
    };
}

export async function composeGroupMembers(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const userIds: Array<string | null> = items.map((item: JsonObject): string | null =>
        getStringField(item, "user_id")
    );
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(userIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            const userId: string | null = getStringField(item, "user_id");
            return {
                ...item,
                user: userId ? (usersMap.get(userId) ?? null) : null
            };
        })
    };
}

export async function composeGroupRequests(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const lookupIds: Array<string | null> = [];
    for (const item of items) {
        lookupIds.push(getStringField(item, "user_id"));
        lookupIds.push(getStringField(item, "reviewed_by"));
    }
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(lookupIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            const userId: string | null = getStringField(item, "user_id");
            const reviewerId: string | null = getStringField(item, "reviewed_by");
            return {
                ...item,
                user: userId ? (usersMap.get(userId) ?? null) : null,
                reviewer: reviewerId ? (usersMap.get(reviewerId) ?? null) : null
            };
        })
    };
}

export async function composeGroupBans(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const lookupIds: Array<string | null> = [];
    for (const item of items) {
        lookupIds.push(getStringField(item, "user_id"));
        lookupIds.push(getStringField(item, "banned_by"));
    }
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(lookupIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            const userId: string | null = getStringField(item, "user_id");
            const bannedById: string | null = getStringField(item, "banned_by");
            return {
                ...item,
                user: userId ? (usersMap.get(userId) ?? null) : null,
                banned_by_user: bannedById ? (usersMap.get(bannedById) ?? null) : null
            };
        })
    };
}

export async function composeAssessment(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    if (!isJsonObject(payload)) {
        return payload;
    }
    const creatorId: string | null = getStringField(payload, "created_by");
    const groupId: string | null = getStringField(payload, "group_id");
    const [usersMap, group]: [Map<string, UserSummary>, unknown | null] = await Promise.all([
        fetchUsersMap([creatorId], ctx.env),
        groupId
            ? fetchOptionalJson(
                  `${ctx.env.services.group}/api/v1/internal/groups/${groupId}`,
                  buildUpstreamHeaders(ctx.env, "group", ctx.user)
              )
            : Promise.resolve(null)
    ]);
    return {
        ...payload,
        creator: creatorId ? (usersMap.get(creatorId) ?? null) : null,
        group
    };
}

export async function composeAssessmentList(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const creatorIds: Array<string | null> = items.map((item: JsonObject): string | null =>
        getStringField(item, "created_by")
    );
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(creatorIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            const creatorId: string | null = getStringField(item, "created_by");
            return {
                ...item,
                creator: creatorId ? (usersMap.get(creatorId) ?? null) : null
            };
        })
    };
}

export async function composeFavoriteAssessments(
    payload: unknown,
    ctx: ComposeContext
): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const creatorIds: Array<string | null> = items.map((item: JsonObject): string | null => {
        if (!isJsonObject(item.assessment)) {
            return null;
        }
        return getStringField(item.assessment, "created_by");
    });
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(creatorIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            if (!isJsonObject(item.assessment)) {
                return item;
            }
            const creatorId: string | null = getStringField(item.assessment, "created_by");
            return {
                ...item,
                assessment: {
                    ...item.assessment,
                    creator: creatorId ? (usersMap.get(creatorId) ?? null) : null
                }
            };
        })
    };
}

export async function composeContest(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    if (!isJsonObject(payload)) {
        return payload;
    }
    const contestId: string | null = getStringField(payload, "id");
    const groupId: string | null = getStringField(payload, "group_id");
    const assessmentId: string | null = getStringField(payload, "assessment_id");
    const organizerId: string | null = getStringField(payload, "organizer_id");

    const [group, assessment, usersMap, participation]: [
        unknown | null,
        unknown | null,
        Map<string, UserSummary>,
        unknown | null
    ] = await Promise.all([
        groupId
            ? fetchOptionalJson(
                  `${ctx.env.services.group}/api/v1/internal/groups/${groupId}`,
                  buildUpstreamHeaders(ctx.env, "group", ctx.user)
              )
            : Promise.resolve(null),
        assessmentId
            ? fetchOptionalJson(
                  `${ctx.env.services.assessment}/api/v1/internal/assessments/${assessmentId}/summary`,
                  buildUpstreamHeaders(ctx.env, "assessment")
              )
            : Promise.resolve(null),
        fetchUsersMap([organizerId], ctx.env),
        contestId && ctx.user !== undefined
            ? fetchOptionalJson(
                  `${ctx.env.services.contest}/api/v1/internal/contests/${contestId}/participation`,
                  buildUpstreamHeaders(ctx.env, "contest", ctx.user)
              )
            : Promise.resolve(null)
    ]);

    return {
        ...payload,
        group,
        assessment,
        organizer: organizerId ? (usersMap.get(organizerId) ?? null) : null,
        participation
    };
}

export async function composeContestList(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const organizerIds: Array<string | null> = items.map((item: JsonObject): string | null =>
        getStringField(item, "organizer_id")
    );
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(organizerIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            const organizerId: string | null = getStringField(item, "organizer_id");
            return {
                ...item,
                organizer: organizerId ? (usersMap.get(organizerId) ?? null) : null
            };
        })
    };
}

export async function composeSubmission(payload: unknown, ctx: ComposeContext): Promise<unknown> {
    if (!isJsonObject(payload)) {
        return payload;
    }
    const studentId: string | null = getStringField(payload, "user_id");
    const graderId: string | null = resolveFirstAnswerGraderId(payload);
    const groupId: string | null = getStringField(payload, "group_id");
    const assessmentId: string | null = getStringField(payload, "assessment_id");
    const contestId: string | null = getStringField(payload, "contest_id");

    const answerGraderIds: Array<string | null> = Array.isArray(payload.answers)
        ? payload.answers.map((answer: unknown): string | null =>
              isJsonObject(answer) ? getStringField(answer, "grader_id") : null
          )
        : [];

    const [usersMap, group, assessment, contest]: [
        Map<string, UserSummary>,
        unknown | null,
        unknown | null,
        unknown | null
    ] = await Promise.all([
        fetchUsersMap([studentId, graderId, ...answerGraderIds], ctx.env),
        groupId
            ? fetchOptionalJson(
                  `${ctx.env.services.group}/api/v1/internal/groups/${groupId}`,
                  buildUpstreamHeaders(ctx.env, "group", ctx.user)
              )
            : Promise.resolve(null),
        assessmentId
            ? fetchOptionalJson(
                  `${ctx.env.services.assessment}/api/v1/internal/assessments/${assessmentId}/summary`,
                  buildUpstreamHeaders(ctx.env, "assessment")
              )
            : Promise.resolve(null),
        contestId
            ? fetchOptionalJson(
                  `${ctx.env.services.contest}/api/v1/internal/contests/${contestId}`,
                  buildUpstreamHeaders(ctx.env, "contest", ctx.user)
              )
            : Promise.resolve(null)
    ]);

    return {
        ...payload,
        student: studentId ? (usersMap.get(studentId) ?? null) : null,
        grader: graderId ? (usersMap.get(graderId) ?? null) : null,
        group,
        assessment,
        contest
    };
}

export async function composeSubmissionList(
    payload: unknown,
    ctx: ComposeContext
): Promise<unknown> {
    const items: JsonObject[] | null = getPaginatedItems(payload);
    if (items === null) {
        return payload;
    }
    const userIds: Array<string | null> = [];
    for (const item of items) {
        userIds.push(getStringField(item, "user_id"));
        userIds.push(resolveFirstAnswerGraderId(item));
    }
    const usersMap: Map<string, UserSummary> = await fetchUsersMap(userIds, ctx.env);
    return {
        ...(payload as JsonObject),
        items: items.map((item: JsonObject): JsonObject => {
            const studentId: string | null = getStringField(item, "user_id");
            const graderId: string | null = resolveFirstAnswerGraderId(item);
            return {
                ...item,
                student: studentId ? (usersMap.get(studentId) ?? null) : null,
                grader: graderId ? (usersMap.get(graderId) ?? null) : null
            };
        })
    };
}
