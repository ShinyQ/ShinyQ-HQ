/** Static room-data files (src/app/data), shared by the build route and the client loaders. */
export const ROOMS_FILE = (locale: string) => `${locale}.json`;
/** The secret B1 drawers live apart so locked sessions never download them. */
export const ENGINE_ROOMS_FILE = (locale: string) => `b1-${locale}.json`;
