import type {
    AdminDataSource,
    AssessmentDataSource,
    ContestDataSource,
    DataSource,
    GroupDataSource,
    NotificationDataSource,
    SubmissionDataSource,
} from "../contracts/dataSource";
import type { Snapshot } from "../../types";

export interface GatewayDataSourceParts {
    read(): Promise<Snapshot>;
    groups: GroupDataSource;
    assessments: AssessmentDataSource;
    contests: ContestDataSource;
    submissions: SubmissionDataSource;
    notifications: NotificationDataSource;
    admin: AdminDataSource;
}

export function createGatewayDataSource(parts: GatewayDataSourceParts): DataSource {
    return {
        read: (): Promise<Snapshot> => parts.read(),
        ...parts.groups,
        ...parts.assessments,
        ...parts.contests,
        ...parts.submissions,
        ...parts.notifications,
        ...parts.admin,
    };
}
