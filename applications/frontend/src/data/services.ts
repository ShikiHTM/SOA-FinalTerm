import type { AppServices } from "./contracts/services";
import { createMockServices } from "./mock/services";

const selectedSource: string = import.meta.env.VITE_DATA_SOURCE || "mock";

export const dataSourceError: string = selectedSource === "mock"
    ? ""
    : selectedSource === "api"
      ? "Chế độ API chưa được triển khai. Cần xác nhận contract và tích hợp Gateway trước khi sử dụng."
      : `VITE_DATA_SOURCE không hợp lệ: ${selectedSource}. Hãy sử dụng mock hoặc api.`;

let services: AppServices | undefined;

export function getServices(): AppServices {
    if (dataSourceError) throw new Error(dataSourceError);
    services ??= createMockServices();
    return services;
}
