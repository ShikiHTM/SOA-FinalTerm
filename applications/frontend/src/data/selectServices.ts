import type { AppServices } from "./contracts/services";

export interface ServiceFactories {
    mock(): AppServices;
    api(): AppServices;
}

export type ServiceSelection =
    | { services: AppServices; error: "" }
    | { services: null; error: string };

export function selectServices(source: string | undefined, factories: ServiceFactories): ServiceSelection {
    const selectedSource: string = source || "mock";
    if (selectedSource !== "mock" && selectedSource !== "api") {
        return {
            services: null,
            error: `VITE_DATA_SOURCE không hợp lệ: ${selectedSource}. Hãy sử dụng mock hoặc api.`,
        };
    }

    try {
        return { services: factories[selectedSource](), error: "" };
    } catch (reason: unknown) {
        return {
            services: null,
            error: reason instanceof Error ? reason.message : "Không thể khởi tạo nguồn dữ liệu.",
        };
    }
}
