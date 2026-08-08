import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as admin from "firebase-admin";

type SourceBucket = "flash" | "custom" | "missing" | "other";

type CollectionAudit = {
  total: number;
  bySourceType: Record<SourceBucket, number>;
  idsBySourceType: Record<SourceBucket, string[]>;
  statusCounts: Record<string, number>;
  statusById: Record<string, string>;
};

const ACTIVE_BOOKING_STATUSES = new Set([
  "pending",
  "pending_payment",
  "confirmed",
  "deposit_paid",
  "in_progress",
]);

const classifySource = (value: unknown): SourceBucket => {
  if (value === "flash") return "flash";
  if (value === "custom") return "custom";
  if (value === undefined || value === null || value === "") return "missing";
  return "other";
};

const emptyCollectionAudit = (): CollectionAudit => ({
  total: 0,
  bySourceType: { flash: 0, custom: 0, missing: 0, other: 0 },
  idsBySourceType: { flash: [], custom: [], missing: [], other: [] },
  statusCounts: {},
  statusById: {},
});

const auditCollection = async (
  db: admin.firestore.Firestore,
  collectionName: string
) => {
  const snapshot = await db.collection(collectionName).get();
  const result = emptyCollectionAudit();

  snapshot.forEach((document) => {
    const data = document.data();
    const bucket = classifySource(data.sourceType);
    const status =
      typeof data.status === "string" && data.status.trim()
        ? data.status
        : "missing";

    result.total += 1;
    result.bySourceType[bucket] += 1;
    result.idsBySourceType[bucket].push(document.id);
    result.statusCounts[status] = (result.statusCounts[status] || 0) + 1;
    result.statusById[document.id] = status;
  });

  return result;
};

const auditBookingSubcollections = async (
  db: admin.firestore.Firestore,
  bookingIds: string[]
) => {
  const result = {
    bookingsInspected: bookingIds.length,
    amendments: 0,
    payments: 0,
    sessions: 0,
  };

  for (const bookingId of bookingIds) {
    const [amendments, payments, sessions] = await Promise.all([
      db.collection("bookings").doc(bookingId).collection("amendments").count().get(),
      db.collection("bookings").doc(bookingId).collection("payments").count().get(),
      db
        .collection("bookingSessions")
        .doc(bookingId)
        .collection("sessions")
        .count()
        .get(),
    ]);
    result.amendments += amendments.data().count;
    result.payments += payments.data().count;
    result.sessions += sessions.data().count;
  }

  return result;
};

const auditBookingShapes = async (db: admin.firestore.Firestore) => {
  const snapshot = await db.collection("bookings").get();
  const multiSessionIds: string[] = [];
  const activeOrIncompleteIds: string[] = [];

  snapshot.forEach((document) => {
    const booking = document.data();
    const sessionCount = Number(booking.estimatedSessionCount || 1);
    const allocations = Array.isArray(booking.sessionAllocations)
      ? booking.sessionAllocations.length
      : 0;
    if (
      booking.projectType === "multi_session" ||
      sessionCount > 1 ||
      allocations > 1
    ) {
      multiSessionIds.push(document.id);
    }

    const status =
      typeof booking.status === "string" ? booking.status : "missing";
    const appointmentStatus =
      typeof booking.appointmentStatus === "string"
        ? booking.appointmentStatus
        : "missing";
    if (
      ACTIVE_BOOKING_STATUSES.has(status) ||
      ["scheduled", "in_progress"].includes(appointmentStatus)
    ) {
      activeOrIncompleteIds.push(document.id);
    }
  });

  return {
    multiSessionCount: multiSessionIds.length,
    multiSessionIds,
    activeOrIncompleteCount: activeOrIncompleteIds.length,
    activeOrIncompleteIds,
  };
};

const auditOneOfOneFlashAvailability = async (
  db: admin.firestore.Firestore
) => {
  const snapshot = await db
    .collection("flashes")
    .where("repeatability", "==", "one_of_one")
    .get();
  const idsByAvailability: Record<string, string[]> = {};

  snapshot.forEach((document) => {
    const flash = document.data();
    const availability =
      typeof flash.availabilityStatus === "string" &&
      flash.availabilityStatus.trim()
        ? flash.availabilityStatus
        : "missing";
    idsByAvailability[availability] ||= [];
    idsByAvailability[availability].push(document.id);
  });

  return {
    total: snapshot.size,
    countsByAvailability: Object.fromEntries(
      Object.entries(idsByAvailability).map(([status, ids]) => [
        status,
        ids.length,
      ])
    ),
    idsByAvailability,
  };
};

const auditStoragePrefix = async (
  bucket: ReturnType<ReturnType<typeof admin.storage>["bucket"]>,
  prefix: string
) => {
  const [files] = await bucket.getFiles({ prefix });
  return {
    prefix,
    count: files.length,
    names: files.map((file) => file.name),
  };
};

const run = async () => {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const [
    bookingRequests,
    offers,
    bookingOffers,
    bookings,
    flashes,
    bookingShapes,
    oneOfOneFlashAvailability,
  ] =
    await Promise.all([
      auditCollection(db, "bookingRequests"),
      auditCollection(db, "offers"),
      auditCollection(db, "bookingOffers"),
      auditCollection(db, "bookings"),
      auditCollection(db, "flashes"),
      auditBookingShapes(db),
      auditOneOfOneFlashAvailability(db),
    ]);

  const legacyBookingIds = [
    ...bookings.idsBySourceType.custom,
    ...bookings.idsBySourceType.missing,
    ...bookings.idsBySourceType.other,
  ];
  const allBookingIds = [
    ...bookings.idsBySourceType.flash,
    ...legacyBookingIds,
  ];
  const [allBookingSubcollections, legacyBookingSubcollections] = await Promise.all([
    auditBookingSubcollections(db, allBookingIds),
    auditBookingSubcollections(db, legacyBookingIds),
  ]);
  const activeLegacyBookingIds = legacyBookingIds.filter((bookingId) => {
    return ACTIVE_BOOKING_STATUSES.has(bookings.statusById[bookingId]);
  });

  let storage: unknown = {
    status: "not-checked",
    reason: "No default Storage bucket is configured.",
  };
  try {
    const bucket = admin.storage().bucket();
    const [userFiles] = await bucket.getFiles({ prefix: "users/" });
    const offerSampleNames = userFiles
      .map((file) => file.name)
      .filter(
        (name) =>
          name.includes("/offers/full/") || name.includes("/offers/thumbs/")
      );
    storage = {
      status: "checked",
      bookingRequestObjects: await auditStoragePrefix(
        bucket,
        "bookingRequests/"
      ),
      offerSampleObjects: {
        count: offerSampleNames.length,
        names: offerSampleNames,
      },
    };
  } catch (error) {
    storage = {
      status: "not-checked",
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const timestamp = new Date();
  const report = {
    generatedAt: timestamp.toISOString(),
    mode: "read-only",
    projectId: admin.app().options.projectId || null,
    collections: {
      bookingRequests,
      offers,
      bookingOffers,
      bookings,
      flashes,
    },
    historical: {
      legacyBookingIds,
      activeLegacyBookingIds,
      bookingShapes,
      allBookingSubcollections,
      legacyBookingSubcollections,
      oneOfOneFlashAvailability,
    },
    storage,
    notes: [
      "No Firestore documents or Storage objects were modified.",
      "Missing sourceType is treated as legacy custom data, never as flash.",
      `Review active legacy statuses manually: ${Array.from(ACTIVE_BOOKING_STATUSES).join(", ")}.`,
    ],
  };

  const outputDirectory = path.resolve(__dirname, "audit-reports");
  const filename = `flash-only-audit-${timestamp
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, filename);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${outputPath}\n`);
};

run().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
