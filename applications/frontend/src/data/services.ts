import type { AppServices } from "./contracts/services";
import { createMockServices } from "./mock/services";
import { createGatewayAdapter } from "./gateway/adapter";
import { selectServices, type ServiceSelection } from "./selectServices";

const selection: ServiceSelection = selectServices(import.meta.env.VITE_DATA_SOURCE, {
    mock: createMockServices,
    api: (): AppServices => createGatewayAdapter(import.meta.env.VITE_API_BASE_URL),
});
export const dataSourceError: string = selection.error;

export function getServices(): AppServices {
    if (!selection.services) throw new Error(selection.error);
    return selection.services;
}
