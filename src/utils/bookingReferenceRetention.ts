import { Timestamp } from "firebase/firestore";

const DAY_MS = 24 * 60 * 60 * 1000;

export const BOOKING_REFERENCE_STANDARD_RETENTION_DAYS = 365;
export const BOOKING_REFERENCE_TERMINAL_RETENTION_DAYS = 90;

export const getBookingReferenceCleanupTimestamp = (days: number) =>
  Timestamp.fromDate(new Date(Date.now() + days * DAY_MS));
