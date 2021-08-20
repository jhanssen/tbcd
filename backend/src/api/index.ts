import { API } from "./common";
import { initialize as wsInitialize } from "./ws-api";
import { initialize as spInitialize } from "./sp-api";
import { initialize as statusInitialize, getStatus } from "./status";

const apis: { [key: string]: API } = {};

export function getAPI(port: string) {
    if (port in apis)
        return apis[port];
    const api = new API(port);
    apis[port] = api;
    return api;
}

export { API, wsInitialize, spInitialize, statusInitialize, getStatus };
