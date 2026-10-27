/** Public interface of the events module (NFR-1). Producers do not import this:
 *  they publish through shared/events and never learn who is listening. */
export { eventsRouter } from './events.routes.js';
export { stop as closeAllStreams } from './events.hub.js';
