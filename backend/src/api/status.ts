import { getAPI } from "./index";

export interface APIStatus {
    error?: Error;
    open: boolean;
}

const apiStatus: APIStatus = {
    open: false
};

interface StatusOptions {
    ideComPort: string;
}

export async function initialize(opts: StatusOptions) {
    const api = getAPI(opts.ideComPort);
    api.on("open", () => {
        apiStatus.open = true;
        apiStatus.error = undefined;
    });
    api.on("close", () => {
        apiStatus.open = false;
    });
    api.on("error", (e: Error) => {
        apiStatus.open = false;
        apiStatus.error = e;
    });
}

export function getStatus() {
    return apiStatus;
}
