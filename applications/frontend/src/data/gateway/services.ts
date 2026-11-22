import type { DataSource } from "../contracts/dataSource";
import type { AccountService, AppServices, SessionStore } from "../contracts/services";
import { createGatewayDataSource, type GatewayDataSourceParts } from "./dataSource";

export interface GatewayServiceParts {
    accounts: AccountService;
    session: SessionStore;
    createDataSourceParts(email: string): GatewayDataSourceParts;
}

export function createGatewayServices(parts: GatewayServiceParts): AppServices {
    return {
        accounts: parts.accounts,
        session: parts.session,
        createDataSource(email: string): DataSource {
            return createGatewayDataSource(parts.createDataSourceParts(email));
        },
    };
}
