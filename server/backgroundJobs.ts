/**
 * Registers every recurring background job, then starts them. Each feature
 * keeps its job in its own module and adds one line here.
 */
import { startJobs } from "./jobs";

export async function startBackgroundJobs() {
  // e.g. (await import("./followUps")).registerFollowUpJobs();
  (await import("./holds")).registerHoldJobs();
  startJobs();
}
