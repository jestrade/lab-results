import type { en } from './en';

/**
 * Every key the interface can ask for.
 *
 * Derived from the English catalog rather than declared separately, so there
 * is one list to keep in step instead of two.
 */
export type MessageKey = keyof typeof en;

/**
 * A complete catalog.
 *
 * `Record` rather than `Partial<Record>` on purpose: a locale is either fully
 * translated or it is not offered. A half-populated catalog would put the
 * decision about which sentences a Spanish reader sees in English into
 * whoever last edited the file, silently.
 */
export type Messages = Record<MessageKey, string>;
