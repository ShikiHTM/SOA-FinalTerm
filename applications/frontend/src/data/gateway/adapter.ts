import type { AppServices } from "../contracts/services";
import { HttpClient } from "../http/httpClient";

export function createGatewayAdapter(baseUrl: string | undefined): AppServices {
    if (!baseUrl) {
        throw new Error("Thiếu VITE_API_BASE_URL. Hãy cấu hình địa chỉ API Gateway.");
    }

    new HttpClient(baseUrl);

    // TODO: Triển khai các adapter, session và xác thực theo contract Gateway, sau đó ghép bằng createGatewayServices.
    throw new Error("Adapter API chưa hoàn thiện. Cần tích hợp các service và xác thực theo contract Gateway.");
}
