export function getLoadsManager(state: any): any;
export function getUrls(url: any, query: any): import("reselect").Selector<any, any[]>;
export function getUrl(url: any, query: any): (state: any) => any;
export function getIsUploadingUrl(url: any, query: any): (state: any) => boolean;
export function getIsDownloadingUrl(url: any, query: any): (state: any) => boolean;
export function urlLoadsCount(type: any): (url: any, query: any) => (state: any) => any;
export function getUploadingUrlCount(url: any, query: any): (state: any) => any;
export function getDownloadingUrlCount(url: any, query: any): (state: any) => any;
export function getUrlLoadsCount(url: any, query: any): (state: any) => any;
export function getLoadingProgress(url: any, query: any): (state: any) => any;
export function getIsLoadingUrl(url: any, query: any): (state: any) => boolean;
export const getUploadsCount: any;
export const getDownloadsCount: any;
export const getIsUploading: any;
export const getIsDownloading: any;
export const getIsLoading: any;
