import pino from 'pino';

/** The app logger. In extension pages and the service worker, pino writes through `console`. */
export const logger = pino();
