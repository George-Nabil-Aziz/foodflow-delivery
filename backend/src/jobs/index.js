import { config } from '../config/index.js';
import { logger } from '../shared/logger.js';
import { runLocked } from './runLocked.js';
import { dispatchJob } from './dispatch.job.js';
import { offerExpiryJob } from './offerExpiry.job.js';
import { orderTimeoutJob } from './orderTimeout.job.js';
import { unassignedEscalationJob } from './unassignedEscalation.job.js';
import { paymentTimeoutJob } from './paymentTimeout.job.js';
import { refundSweepJob } from './refundSweep.job.js';

export {
  dispatchJob, offerExpiryJob, orderTimeoutJob, unassignedEscalationJob,
  paymentTimeoutJob, refundSweepJob, runLocked,
};

const REGISTRY = [
  { name: 'dispatch', intervalMs: 20_000, fn: dispatchJob },
  { name: 'offerExpiry', intervalMs: 15_000, fn: offerExpiryJob },
  { name: 'orderTimeout', intervalMs: 60_000, fn: orderTimeoutJob },
  { name: 'unassignedEscalation', intervalMs: 60_000, fn: unassignedEscalationJob },
  { name: 'paymentTimeout', intervalMs: 60_000, fn: paymentTimeoutJob },
  { name: 'refundSweep', intervalMs: 60_000, fn: refundSweepJob },
];

let timers = [];

export function startJobs() {
  // Never in tests: jobs are invoked directly so their behaviour is
  // deterministic and nothing waits on real time.
  if (config.isTest || !config.runJobs) return;
  timers = REGISTRY.map(({ name, intervalMs, fn }) => {
    // Never below a second, however aggressively the scale is set: a tighter
    // loop would spend more time contending for the advisory lock than working.
    const period = Math.max(1_000, Math.round(intervalMs * config.jobIntervalScale));
    const timer = setInterval(() => {
      runLocked(name, fn).catch((err) => logger.error({ err, name }, 'job crashed'));
    }, period);
    timer.unref?.();
    return timer;
  });
  logger.info({ jobs: REGISTRY.map((j) => j.name) }, 'background jobs started');
}

export function stopJobs() {
  timers.forEach(clearInterval);
  timers = [];
}
