import got, { HTTPError } from "got";
import type { EnvConfig } from "./env";
import { AppError } from "./errors";
import type { GroupMemberRole, GroupStatus, GroupVisibility } from "./types";

export interface GroupMembershipInfo {
    group_id: string;
    user_id: string;
    group_status: GroupStatus;
    visibility: GroupVisibility;
    is_member: boolean;
    is_banned: boolean;
    role: GroupMemberRole | null;
    can_manage: boolean;
    is_owner: boolean;
}

export interface GroupAccessClient {
    getMembership(groupId: string, userId: string): Promise<GroupMembershipInfo>;
}

const GROUP_SERVICE_TIMEOUT_MS: number = 5000;

export function createGroupAccessClient(env: EnvConfig): GroupAccessClient {
    return {
        async getMembership(groupId: string, userId: string): Promise<GroupMembershipInfo> {
            const url: string = `${env.groupServiceUrl}/api/v1/internal/groups/${groupId}/members/${userId}`;
            try {
                return await got
                    .get(url, {
                        headers: {
                            Accept: "application/json",
                            "X-Internal-Secret": env.internalServiceSecret
                        },
                        timeout: {
                            request: GROUP_SERVICE_TIMEOUT_MS
                        }
                    })
                    .json<GroupMembershipInfo>();
            } catch (error: unknown) {
                if (error instanceof HTTPError && error.response.statusCode === 404) {
                    throw AppError.notFound("GROUP_NOT_FOUND", "Group not found.");
                }
                throw AppError.badGateway(
                    "GROUP_SERVICE_UNAVAILABLE",
                    "Failed to verify group membership."
                );
            }
        }
    };
}
