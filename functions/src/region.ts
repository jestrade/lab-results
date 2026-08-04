/**
 * Deployment region for every function in this codebase.
 *
 * `us-east1` because that is where the project's Cloud Storage bucket lives,
 * and **a Storage-triggered function must be co-located with its bucket** —
 * Eventarc will not create a trigger across regions. Keeping the callables
 * here too means one region to reason about, and a client calling
 * `httpsCallable` does not need a different region per function.
 *
 * Override with FUNCTIONS_REGION if the bucket ever moves. One constant rather
 * than a copy per file, because four copies of a region is four chances for
 * one of them to be wrong in a way that only shows up at deploy time.
 */
export const REGION = process.env.FUNCTIONS_REGION ?? 'us-east1';
