import type { NotificationDataSource } from "../contracts/dataSource";
import type { HttpClient } from "../http/httpClient";

export interface GatewayRequest {
    path: string;
    init: RequestInit;
}

export interface NotificationAdapterOptions {
    client: Pick<HttpClient, "requestJson">;
    // TODO: Cấu hình route, phương thức và xác thực theo contract Gateway đã được xác nhận.
    markReadRequest(notificationId: string): GatewayRequest;
}

export function createNotificationAdapter(options: NotificationAdapterOptions): NotificationDataSource {
    return {
        async markRead(notificationId: string): Promise<void> {
            const request: GatewayRequest = options.markReadRequest(notificationId);
            await options.client.requestJson<unknown>(request.path, request.init);
        },
    };
}
