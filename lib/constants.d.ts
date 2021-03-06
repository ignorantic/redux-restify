export const MODULE_NAME: "@@restify";
export const ROUTER_LOCATION_CHANGE_ACTION: "@@router/LOCATION_CHANGE";
export const INIT_ACTION: "@@INIT";
export const ACTION_UPDATE: "update";
export const ACTION_DELETE: "delete";
export const ACTION_CREATE: "create";
export const ACTIONS_ALERTS: {
    [ACTION_UPDATE]: (name: any) => string;
    [ACTION_DELETE]: (name: any) => string;
    [ACTION_CREATE]: (name: any) => string;
};
