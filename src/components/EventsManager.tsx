import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { db, functions, storage } from "../firebase/firebaseConfig";
import type {
  ArtistEvent,
  EventBookingMode,
  EventClientActionType,
  EventLocationType,
  EventPriceType,
  EventStatus,
  EventType,
} from "../types/Event";
import type { EventRegistration } from "../types/EventRegistration";
import { isStripeConnectReady, type StripeConnectLike } from "../utils/stripeConnect";

type EventFilter = "all" | EventStatus;

type EventFormState = {
  title: string;
  description: string;
  eventType: EventType;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  locationType: EventLocationType;
  shopName: string;
  address: string;
  mapLink: string;
  priceType: EventPriceType;
  bookingMode: EventBookingMode;
  clientActionType: EventClientActionType;
  externalUrl: string;
  externalLabel: string;
  price: string;
  depositRequired: boolean;
  depositAmount: string;
  capacity: string;
  participantArtistIds: string[];
  tags: string[];
  tagDraft: string;
  status: EventStatus;
  visibility: "public" | "private";
};

type EventFormErrorKey =
  | keyof EventFormState
  | "dateRange"
  | "timeRange"
  | "location"
  | "stripe";

type EventFormErrors = Partial<Record<EventFormErrorKey, string>>;

type EventEditorStepKey = "basics" | "schedule" | "pricing" | "publish";

type ArtistLite = {
  shopId?: string;
  studioName?: string;
} & StripeConnectLike;

type ShopDefaults = {
  id: string;
  name?: string;
  address?: string;
  mapLink?: string;
};

type ShopRosterArtist = {
  id: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
};

const emptyForm: EventFormState = {
  title: "",
  description: "",
  eventType: "flash_day",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  locationType: "shop",
  shopName: "",
  address: "",
  mapLink: "",
  priceType: "varies",
  bookingMode: "rsvp",
  clientActionType: "free_rsvp",
  externalUrl: "",
  externalLabel: "",
  price: "",
  depositRequired: false,
  depositAmount: "",
  capacity: "",
  participantArtistIds: [],
  tags: [],
  tagDraft: "",
  status: "draft",
  visibility: "public",
};

const eventTypeLabels: Record<EventType, string> = {
  flash_day: "Flash Day",
  guest_spot: "Guest Spot",
  convention: "Convention",
  pop_up: "Pop-up",
  walk_in_day: "Walk-in Day",
  shop_event: "Open House / Shop Event",
  other: "Other",
};

const priceTypeLabels: Record<EventPriceType, string> = {
  free: "Free",
  fixed: "Fixed Price",
  starting_at: "Starting At",
  varies: "Varies",
};

const clientActionLabels: Record<EventClientActionType, string> = {
  details_only: "Details only",
  free_rsvp: "Free RSVP",
  paid_event_pass: "Paid event pass",
  flash_reservation: "Flash reservation",
  appointment_request: "Appointment request",
  waitlist: "SATX waitlist",
  external_link: "External link",
};

const eventClientActionOptions: Array<{
  value: EventClientActionType;
  label: string;
  note: string;
}> = [
  {
    value: "details_only",
    label: "Details only",
    note: "Announcement page with SATX profile and discovery links.",
  },
  {
    value: "free_rsvp",
    label: "Free RSVP",
    note: "Attendance/reminder pass only. This should not promise a tattoo spot.",
  },
  {
    value: "paid_event_pass",
    label: "Paid event pass",
    note: "Admission-style pass for workshops, private previews, expos, or VIP access.",
  },
  {
    value: "flash_reservation",
    label: "Flash reservation",
    note: "Flash-day funnel that keeps clients inside SATX flash/profile flows.",
  },
  {
    value: "appointment_request",
    label: "Appointment request",
    note: "Best for guest spots, conventions, and limited booking windows.",
  },
  {
    value: "waitlist",
    label: "SATX waitlist",
    note: "Walk-in interest capture that can be converted into SATX bookings.",
  },
  {
    value: "external_link",
    label: "External link",
    note: "Use sparingly for convention or admission sites that must stay external.",
  },
];

const eventEditorSteps: Array<{
  key: EventEditorStepKey;
  title: string;
  description: string;
}> = [
  {
    key: "basics",
    title: "Event story",
    description: "Name the event, choose the format, and add the visual.",
  },
  {
    key: "schedule",
    title: "Time and place",
    description: "Set when it happens and where visitors should go.",
  },
  {
    key: "pricing",
    title: "Access",
    description: "Choose how visitors access the event.",
  },
  {
    key: "publish",
    title: "Review",
    description: "Add search tags, confirm visibility, and publish when ready.",
  },
];

const stepErrorKeys: Record<EventEditorStepKey, EventFormErrorKey[]> = {
  basics: ["title", "externalUrl", "participantArtistIds"],
  schedule: ["startDate", "dateRange", "timeRange", "location"],
  pricing: ["price", "depositAmount", "capacity", "stripe"],
  publish: [],
};

const statusStyles: Record<EventStatus, string> = {
  draft: "border-white/10 bg-white/[0.05] text-white/60",
  published: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  cancelled: "border-red-400/20 bg-red-400/10 text-red-200",
  completed: "border-sky-400/20 bg-sky-400/10 text-sky-200",
};

const EventsManager = ({
  uid,
  artist,
  onOpenPayments,
  ownerType = "artist",
  shopOverride,
  shopRosterArtists = [],
  managerTitle = "Artist events",
  managerDescription = "Promote events that convert client interest into SATX RSVPs, tattoo requests, flash reservations, or paid event passes.",
}: {
  uid: string;
  artist?: ArtistLite | null;
  onOpenPayments?: () => void;
  ownerType?: "artist" | "shop";
  shopOverride?: ShopDefaults | null;
  shopRosterArtists?: ShopRosterArtist[];
  managerTitle?: string;
  managerDescription?: string;
}) => {
  const [events, setEvents] = useState<ArtistEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<EventFilter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ArtistEvent | null>(null);
  const [form, setForm] = useState<EventFormState>(emptyForm);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<ArtistEvent | null>(null);
  const [shopDefaults, setShopDefaults] = useState<ShopDefaults | null>(null);
  const [registrationsByEventId, setRegistrationsByEventId] = useState<
    Record<string, EventRegistration[]>
  >({});
  const [checkingInRegistrationId, setCheckingInRegistrationId] = useState("");
  const stripeReady = isStripeConnectReady(artist);

  const fetchEvents = async () => {
    if (!uid) return;

    try {
      setLoading(true);
      const snapshots =
        ownerType === "shop" && shopOverride?.id
          ? await Promise.all([
              getDocs(
                query(
                  collection(db, "events"),
                  where("shopId", "==", shopOverride.id),
                  where("ownerType", "==", "shop")
                )
              ),
              getDocs(
                query(
                  collection(db, "events"),
                  where("createdBy", "==", uid),
                  where("ownerType", "==", "shop")
                )
              ),
            ])
          : [
              await getDocs(
                query(collection(db, "events"), where("artistId", "==", uid))
              ),
            ];
      const eventsById = new Map<string, ArtistEvent>();
      snapshots.forEach((snapshot) => {
        snapshot.docs.forEach((eventDoc) => {
          const event = {
            id: eventDoc.id,
            ...eventDoc.data(),
          } as ArtistEvent;

          if (
            ownerType !== "shop" ||
            !shopOverride?.id ||
            eventBelongsToShop(event, shopOverride)
          ) {
            eventsById.set(eventDoc.id, event);
          }
        });
      });
      const result = Array.from(eventsById.values());

      setEvents(result.sort((a, b) => getEventTime(a) - getEventTime(b)));
    } catch (err) {
      console.error("Failed to fetch events:", err);
      toast.error("Failed to load events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, ownerType, shopOverride?.id]);

  useEffect(() => {
    if (!uid) return undefined;

    const unsubscribe = onSnapshot(
      query(collection(db, "eventRegistrations"), where("hostUserId", "==", uid)),
      (snapshot) => {
        const grouped: Record<string, EventRegistration[]> = {};
        snapshot.docs.forEach((registrationDoc) => {
          const registration = {
            id: registrationDoc.id,
            ...registrationDoc.data(),
          } as EventRegistration;

          if (registration.status === "cancelled" || registration.status === "refunded") return;
          grouped[registration.eventId] = [
            ...(grouped[registration.eventId] || []),
            registration,
          ];
        });

        Object.values(grouped).forEach((items) =>
          items.sort((a, b) =>
            String(a.clientName || "").localeCompare(String(b.clientName || ""))
          )
        );
        setRegistrationsByEventId(grouped);
      },
      (error) => console.error("Event attendee listener failed:", error)
    );

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    let isMounted = true;

    const fetchShopDefaults = async () => {
      if (shopOverride) {
        setShopDefaults(shopOverride);
        return;
      }

      if (!artist?.shopId) {
        setShopDefaults(null);
        return;
      }

      try {
        const shopSnap = await getDoc(doc(db, "shops", artist.shopId));
        if (!isMounted) return;

        if (shopSnap.exists()) {
          const shopData = shopSnap.data() as Omit<ShopDefaults, "id">;
          setShopDefaults({
            id: shopSnap.id,
            name: shopData.name,
            address: shopData.address,
            mapLink: shopData.mapLink,
          });
        }
      } catch (err) {
        console.error("Failed to fetch shop defaults:", err);
      }
    };

    fetchShopDefaults();
    return () => {
      isMounted = false;
    };
  }, [artist?.shopId, shopOverride]);

  useEffect(() => {
    if (!thumbnailFile) {
      setThumbnailPreview(null);
      return;
    }

    const objectUrl = URL.createObjectURL(thumbnailFile);
    setThumbnailPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [thumbnailFile]);

  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((event) => event.status === filter);
  }, [events, filter]);

  const stats = useMemo(
    () => ({
      published: events.filter((event) => event.status === "published").length,
      draft: events.filter((event) => event.status === "draft").length,
      upcoming: events.filter((event) => isUpcomingEvent(event)).length,
    }),
    [events]
  );

  const openCreateModal = () => {
    const defaultClientAction = getDefaultClientAction(
      emptyForm.eventType,
      ownerType
    );
    setEditingEvent(null);
    setForm({
      ...emptyForm,
      clientActionType: defaultClientAction,
      bookingMode: getBookingModeForClientAction(defaultClientAction),
      priceType:
        defaultClientAction === "paid_event_pass" ? "fixed" : emptyForm.priceType,
      depositRequired: false,
      participantArtistIds: [],
      shopName: shopDefaults?.name || artist?.studioName || "",
      address: shopDefaults?.address || "",
      mapLink: shopDefaults?.mapLink || "",
    });
    setThumbnailFile(null);
    setIsModalOpen(true);
  };

  const openEditModal = (event: ArtistEvent) => {
    const bookingMode = event.bookingMode || getDefaultBookingMode(event.eventType);
    const clientActionType = getEventClientActionType(event);

    setEditingEvent(event);
    setForm({
      title: event.title || "",
      description: event.description || "",
      eventType: event.eventType || "other",
      startDate: event.startDate || "",
      startTime: event.startTime || "",
      endDate: event.endDate || "",
      endTime: event.endTime || "",
      locationType: event.locationType || "custom",
      shopName: event.shopName || "",
      address: event.address || "",
      mapLink: event.mapLink || "",
      priceType:
        (event.priceType as string) === "deposit_required"
          ? "fixed"
          : event.priceType || "varies",
      bookingMode,
      clientActionType,
      externalUrl: event.externalUrl || "",
      externalLabel: event.externalLabel || "",
      price: typeof event.price === "number" ? String(event.price) : "",
      depositRequired:
        bookingMode !== "info_only" &&
        (Boolean(event.depositRequired) ||
          (event.priceType as string) === "deposit_required" ||
          (typeof event.depositAmount === "number" && event.depositAmount > 0)),
      depositAmount:
        bookingMode !== "info_only" && typeof event.depositAmount === "number"
          ? String(event.depositAmount)
          : "",
      capacity:
        typeof event.capacity === "number" && event.capacity > 0
          ? String(event.capacity)
          : "",
      participantArtistIds: event.participantArtistIds || [],
      tags: event.tags || [],
      tagDraft: "",
      status: event.status || "draft",
      visibility: event.visibility || "public",
    });
    setThumbnailFile(null);
    setThumbnailPreview(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditingEvent(null);
    setThumbnailFile(null);
    setThumbnailPreview(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!uid || isSaving) return;

    const validationErrors = getEventFormErrors(form, stripeReady, ownerType);
    const firstValidationError = getFirstEventFormError(validationErrors);

    if (firstValidationError) {
      toast.error(firstValidationError);
      return;
    }

    const parsedCapacity = isShopFlashReservation(
      form.clientActionType,
      ownerType
    )
      ? null
      : parseOptionalNumber(form.capacity);
    const bookingMode = getBookingModeForClientAction(form.clientActionType);

    try {
      setIsSaving(true);
      const eventId = editingEvent?.id || `event_${Date.now()}`;
      const imageUpload = thumbnailFile
        ? await uploadEventThumbnail(uid, eventId, thumbnailFile)
        : null;

      const payload = {
        artistId: ownerType === "artist" ? uid : "",
        createdBy: uid,
        ownerType,
        title: form.title.trim(),
        description: form.description.trim() || "",
        eventType: form.eventType,
        startDate: form.startDate,
        startTime: form.startTime || "",
        endDate: form.endDate || "",
        endTime: form.endTime || "",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locationType: form.locationType,
        shopId:
          ownerType === "shop"
            ? shopOverride?.id || shopDefaults?.id || ""
            : form.locationType === "shop"
            ? shopOverride?.id || artist?.shopId || shopDefaults?.id || ""
            : "",
        shopName: form.shopName.trim() || "",
        address: form.address.trim() || "",
        mapLink: form.mapLink.trim() || "",
        priceType: form.priceType,
        bookingMode,
        clientActionType: form.clientActionType,
        externalUrl:
          form.clientActionType === "external_link"
            ? form.externalUrl.trim()
            : "",
        externalLabel:
          form.clientActionType === "external_link"
            ? form.externalLabel.trim()
            : "",
        price:
          form.priceType === "free" || form.priceType === "varies"
            ? null
            : parseOptionalNumber(form.price),
        depositRequired: false,
        depositAmount: null,
        capacity: parsedCapacity || null,
        spotsClaimed: editingEvent?.spotsClaimed || 0,
        participantArtistIds:
          ownerType === "shop" ? form.participantArtistIds : [],
        satxActionNote: getClientActionDashboardNote(form.clientActionType),
        tags: form.tags,
        status: form.status,
        visibility: form.visibility,
        ...(imageUpload || {}),
        updatedAt: serverTimestamp(),
      };

      if (editingEvent) {
        await updateDoc(doc(db, "events", editingEvent.id), payload);
        toast.success("Event updated.");
      } else {
        await addDoc(collection(db, "events"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Event created.");
      }

      closeModal();
      fetchEvents();
    } catch (err) {
      console.error("Failed to save event:", err);
      toast.error("Failed to save event.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (
    event: ArtistEvent,
    status: EventStatus
  ) => {
    if (
      status === "published" &&
      eventModeRequiresPayment(
        event.bookingMode || getDefaultBookingMode(event.eventType)
      ) &&
      !stripeReady
    ) {
      toast.error("Connect Stripe before publishing paid events.");
      return;
    }

    try {
      await updateDoc(doc(db, "events", event.id), {
        status,
        visibility: status === "published" ? "public" : event.visibility,
        updatedAt: serverTimestamp(),
      });
      setEvents((current) =>
        current.map((item) =>
          item.id === event.id
            ? {
                ...item,
                status,
                visibility: status === "published" ? "public" : item.visibility,
              }
            : item
        )
      );
      toast.success(`Event marked ${status}.`);
    } catch (err) {
      console.error("Failed to update event status:", err);
      toast.error("Failed to update event.");
    }
  };

  const handleDelete = async () => {
    if (!eventToDelete) return;

    try {
      await deleteDoc(doc(db, "events", eventToDelete.id));
      if (eventToDelete.thumbnailPath) {
        await deleteObject(ref(storage, eventToDelete.thumbnailPath)).catch(
          () => undefined
        );
      }
      setEvents((current) =>
        current.filter((event) => event.id !== eventToDelete.id)
      );
      setEventToDelete(null);
      toast.success("Event deleted.");
    } catch (err) {
      console.error("Failed to delete event:", err);
      toast.error("Failed to delete event.");
    }
  };

  const handleCheckInRegistration = async (registration: EventRegistration) => {
    if (!registration.qrToken) {
      toast.error("This event pass is missing its check-in token.");
      return;
    }

    setCheckingInRegistrationId(registration.id);
    try {
      const checkIn = httpsCallable<
        { registrationId: string; qrToken: string },
        { status: string; alreadyCheckedIn?: boolean }
      >(functions, "checkInEventRegistration");
      const result = await checkIn({
        registrationId: registration.id,
        qrToken: registration.qrToken,
      });
      toast.success(
        result.data.alreadyCheckedIn
          ? "Attendee was already checked in."
          : "Attendee checked in."
      );
    } catch (error) {
      console.error("Event check-in failed:", error);
      toast.error(
        getEventManagerCallableErrorMessage(error, "Could not check in attendee.")
      );
    } finally {
      setCheckingInRegistrationId("");
    }
  };

  return (
    <section className="space-y-6">
      <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            {managerTitle}
          </p>
          <h2 className="mt-2 text-3xl! font-semibold text-white">Events</h2>
          <p className="max-w-2xl text-sm text-white/50">
            {managerDescription}
          </p>
        </div>
        {events.length > 0 && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
          >
            <Plus size={17} />
            Add Event
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:max-w-[500px]">
        <EventStat label="Published" value={stats.published} />
        <EventStat label="Drafts" value={stats.draft} />
        <EventStat label="Upcoming" value={stats.upcoming} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            "all",
            "published",
            "draft",
            "cancelled",
            "completed",
          ] as EventFilter[]
        ).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setFilter(item)}
            className={`rounded-full border px-3! py-1.5! text-xs! font-semibold capitalize transition ${
              filter === item
                ? "border-white bg-white text-black"
                : "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <EventsSkeleton />
      ) : filteredEvents.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <CalendarDays className="mx-auto mb-3 text-white/30" size={36} />
          <h3 className="text-lg font-semibold text-white">No events yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/50">
            Create your first event to promote a flash day, pop-up, convention
            appearance, or walk-in opportunity.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-5 rounded-md bg-white px-4! py-2! text-sm! font-semibold text-black hover:bg-white/85"
          >
            Add Event
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredEvents.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onEdit={() => openEditModal(event)}
              onDelete={() => setEventToDelete(event)}
              onStatusChange={(status) => handleStatusChange(event, status)}
              canPublishPaidEvent={stripeReady}
              registrations={registrationsByEventId[event.id] || []}
              checkingInRegistrationId={checkingInRegistrationId}
              onCheckInRegistration={handleCheckInRegistration}
            />
          ))}
        </div>
      )}

      {isModalOpen && (
        <EventEditorModal
          form={form}
          setForm={setForm}
          editingEvent={editingEvent}
          thumbnailFile={thumbnailFile}
          thumbnailPreview={thumbnailPreview}
          onFileChange={setThumbnailFile}
          onClose={closeModal}
          onSave={handleSave}
          isSaving={isSaving}
          stripeReady={stripeReady}
          onOpenPayments={onOpenPayments}
          ownerType={ownerType}
          shopRosterArtists={shopRosterArtists}
        />
      )}

      {eventToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#111] p-6 shadow-2xl">
            <h3 className="text-xl font-semibold text-white">Delete event?</h3>
            <p className="mt-2 text-sm text-white/55">
              This removes "{eventToDelete.title}" from your dashboard and any
              future public event listings.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                className="rounded-md bg-white/[0.06] px-4! py-2! text-sm! text-white/75 hover:bg-white/[0.1]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md bg-red-500 px-4! py-2! text-sm! font-semibold text-white hover:bg-red-400"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

const EventCard = ({
  event,
  onEdit,
  onDelete,
  onStatusChange,
  canPublishPaidEvent,
  registrations,
  checkingInRegistrationId,
  onCheckInRegistration,
}: {
  event: ArtistEvent;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: EventStatus) => void;
  canPublishPaidEvent: boolean;
  registrations: EventRegistration[];
  checkingInRegistrationId: string;
  onCheckInRegistration: (registration: EventRegistration) => void;
}) => {
  const priceLabel = getPriceLabel(event);
  const locationLabel = getLocationLabel(event);
  const requiresPayment = eventModeRequiresPayment(
    event.bookingMode || getDefaultBookingMode(event.eventType)
  );
  const clientActionType = getEventClientActionType(event);
  const checkedInCount = registrations.filter(
    (registration) => registration.status === "checked_in"
  ).length;

  return (
    <article className="group overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.055] via-white/[0.025] to-transparent shadow-xl transition hover:border-white/20">
      <div className="grid min-h-[220px] grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)]">
        <div className="relative min-h-[180px] bg-black/30">
          {event.thumbnailUrl ? (
            <img
              src={event.thumbnailUrl}
              alt={event.title}
              className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
            />
          ) : (
            <div className="flex h-full w-full items-end bg-gradient-to-br from-white/[0.08] via-transparent to-black p-4">
              <CalendarDays className="text-white/25" size={34} />
            </div>
          )}
          <span
            className={`absolute left-3 top-3 rounded-full border px-2 py-1 text-[11px] font-semibold capitalize backdrop-blur ${
              statusStyles[event.status]
            }`}
          >
            {event.status}
          </span>
        </div>
        <div className="flex min-w-0 flex-col p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                {eventTypeLabels[event.eventType] || "Event"}
              </p>
              <h3 className="mt-1 line-clamp-2 text-lg font-semibold text-white">
                {event.title}
              </h3>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md bg-white/[0.06] p-2! text-white/65 hover:bg-white/[0.12] hover:text-white"
                aria-label="Edit event"
              >
                <Pencil size={16} />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md bg-white/[0.06] p-2! text-white/65 hover:bg-red-500/20 hover:text-red-200"
                aria-label="Delete event"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-white/60">
            <EventMeta
              icon={<CalendarDays size={15} />}
              text={formatEventDate(event)}
            />
            <EventMeta icon={<MapPin size={15} />} text={locationLabel} />
            <EventMeta icon={<DollarSign size={15} />} text={priceLabel} />
            <EventMeta
              icon={<CreditCard size={15} />}
              text={clientActionLabels[clientActionType]}
            />
            <EventMeta
              icon={<Users size={15} />}
              text={getEventCapacityLabel(event, registrations.length)}
            />
          </div>

          {registrations.length > 0 && (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
                  Attendees
                </p>
                <span className="text-xs text-white/45">
                  {checkedInCount}/{registrations.length} checked in
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {registrations.slice(0, 4).map((registration) => {
                  const canCheckIn =
                    registration.status === "reserved" ||
                    registration.status === "paid";

                  return (
                    <div
                      key={registration.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white/80">
                          {registration.clientName || "Client"}
                        </p>
                        <p className="text-xs capitalize text-white/40">
                          {registration.status.replace("_", " ")}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCheckInRegistration(registration)}
                        disabled={
                          !canCheckIn ||
                          registration.status === "checked_in" ||
                          checkingInRegistrationId === registration.id
                        }
                        className="rounded-md bg-white px-3! py-1.5! text-xs! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {checkingInRegistrationId === registration.id
                          ? "Checking..."
                          : registration.status === "checked_in"
                          ? "Checked in"
                          : registration.status === "pending_payment"
                          ? "Unpaid"
                          : "Check in"}
                      </button>
                    </div>
                  );
                })}
                {registrations.length > 4 && (
                  <p className="text-xs text-white/35">
                    +{registrations.length - 4} more attendee
                    {registrations.length - 4 === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </div>
          )}

          {event.description && (
            <p className="mt-4 line-clamp-2 text-sm text-white/45">
              {event.description}
            </p>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            {event.status !== "published" && (
              <button
                type="button"
                onClick={() => {
                  if (requiresPayment && !canPublishPaidEvent) {
                    toast.error("Connect Stripe before publishing paid events.");
                    return;
                  }
                  onStatusChange("published");
                }}
                className={`inline-flex items-center gap-1 rounded-full border px-3! py-1.5! text-xs! font-semibold ${
                  requiresPayment && !canPublishPaidEvent
                    ? "border-white/10 bg-white/[0.04] text-white/35"
                    : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15"
                }`}
              >
                <Eye size={14} />
                Publish
              </button>
            )}
            {event.status === "published" && (
              <button
                type="button"
                onClick={() => onStatusChange("draft")}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3! py-1.5! text-xs! font-semibold text-white/65 hover:text-white"
              >
                <EyeOff size={14} />
                Unpublish
              </button>
            )}
            {event.status !== "cancelled" && (
              <button
                type="button"
                onClick={() => onStatusChange("cancelled")}
                className="rounded-full border border-red-400/20 bg-red-400/10 px-3! py-1.5! text-xs! font-semibold text-red-200 hover:bg-red-400/15"
              >
                Cancel
              </button>
            )}
            {event.status !== "completed" && (
              <button
                type="button"
                onClick={() => onStatusChange("completed")}
                className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3! py-1.5! text-xs! font-semibold text-sky-200 hover:bg-sky-400/15"
              >
                Complete
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

const EventEditorModal = ({
  form,
  setForm,
  editingEvent,
  thumbnailFile,
  thumbnailPreview,
  onFileChange,
  onClose,
  onSave,
  isSaving,
  stripeReady,
  onOpenPayments,
  ownerType,
  shopRosterArtists,
}: {
  form: EventFormState;
  setForm: React.Dispatch<React.SetStateAction<EventFormState>>;
  editingEvent: ArtistEvent | null;
  thumbnailFile: File | null;
  thumbnailPreview: string | null;
  onFileChange: (file: File | null) => void;
  onClose: () => void;
  onSave: () => void;
  isSaving: boolean;
  stripeReady: boolean;
  onOpenPayments?: () => void;
  ownerType: "artist" | "shop";
  shopRosterArtists: ShopRosterArtist[];
}) => {
  const [activeStep, setActiveStep] = useState<EventEditorStepKey>("basics");
  const [stepDirection, setStepDirection] = useState<"forward" | "back">(
    "forward"
  );
  const formErrors = getEventFormErrors(form, stripeReady, ownerType);
  const currentStepIndex = eventEditorSteps.findIndex(
    (step) => step.key === activeStep
  );
  const currentStep = eventEditorSteps[currentStepIndex] || eventEditorSteps[0];
  const hasCurrentStepErrors = stepHasErrors(activeStep, formErrors);
  const canSave = !getFirstEventFormError(formErrors);
  const isFinalStep = currentStepIndex === eventEditorSteps.length - 1;
  const eventOwnerLabel = ownerType === "shop" ? "shop" : "artist";
  const usesArtistManagedFlashInventory = isShopFlashReservation(
    form.clientActionType,
    ownerType
  );
  const showDisplayAmount =
    form.priceType === "fixed" || form.priceType === "starting_at";

  const goToStep = (nextStep: EventEditorStepKey) => {
    const nextIndex = eventEditorSteps.findIndex(
      (step) => step.key === nextStep
    );
    setStepDirection(nextIndex > currentStepIndex ? "forward" : "back");
    setActiveStep(nextStep);
  };

  const goToNextStep = () => {
    if (hasCurrentStepErrors) {
      toast.error(
        getFirstStepError(activeStep, formErrors) ||
          "Finish the required fields before continuing."
      );
      return;
    }

    const nextStep = eventEditorSteps[currentStepIndex + 1];
    if (nextStep) goToStep(nextStep.key);
  };

  const goToPreviousStep = () => {
    const previousStep = eventEditorSteps[currentStepIndex - 1];
    if (previousStep) goToStep(previousStep.key);
  };

  return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
    <style>{`
      @keyframes event-step-in-forward {
        from { opacity: 0; transform: translateX(18px); }
        to { opacity: 1; transform: translateX(0); }
      }
      @keyframes event-step-in-back {
        from { opacity: 0; transform: translateX(-18px); }
        to { opacity: 1; transform: translateX(0); }
      }
    `}</style>
    <div className="flex h-[92vh] max-h-[900px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#101010] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/35">
            {editingEvent ? "Edit event" : "New event"}
          </p>
          <h3 className="text-xl font-semibold text-white">
            {editingEvent
              ? editingEvent.title
              : `Create a ${eventOwnerLabel} event`}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-white/[0.06] p-2! text-white/70 hover:bg-white/[0.1] hover:text-white"
          aria-label="Close event editor"
        >
          <X size={20} />
        </button>
      </div>

      <EventStepTabs
        activeStep={activeStep}
        errors={formErrors}
        onSelect={goToStep}
      />

      <div className="request-modal-scrollbar grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
          <div className="lg:sticky lg:top-5">
          <label className="group flex aspect-[4/5] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/15 bg-white/[0.035] text-center transition hover:border-white/35">
            {thumbnailPreview || editingEvent?.thumbnailUrl ? (
              <img
                src={thumbnailPreview || editingEvent?.thumbnailUrl}
                alt="Event thumbnail preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="px-6">
                <Upload className="mx-auto mb-3 text-white/35" size={34} />
                <p className="text-sm font-semibold text-white/75">
                  Upload event thumbnail
                </p>
                <p className="mt-2 text-xs text-white/40">
                  A poster, flash sheet crop, or event artwork works best.
                </p>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) =>
                onFileChange(event.target.files?.[0] || null)
              }
            />
          </label>
          {thumbnailFile && (
            <button
              type="button"
              onClick={() => onFileChange(null)}
              className="mt-3 w-full rounded-md bg-white/[0.06] px-3! py-2! text-sm! text-white/70 hover:bg-white/[0.1]"
            >
              Remove selected image
            </button>
          )}
          </div>
        </div>

        <div
          key={activeStep}
          className="space-y-5 p-5"
          style={{
            animation: `${
              stepDirection === "forward"
                ? "event-step-in-forward"
                : "event-step-in-back"
            } 240ms cubic-bezier(0.22, 1, 0.36, 1)`,
          }}
        >
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40">
              Step {currentStepIndex + 1} of {eventEditorSteps.length}
            </p>
            <h4 className="mt-2 text-2xl! font-semibold text-white">
              {currentStep.title}
            </h4>
            <p className="mt-1 text-sm leading-6 text-white/50">
              {currentStep.description}
            </p>
          </div>

          {activeStep === "basics" && (
            <>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" error={formErrors.title}>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
                placeholder="Friday the 13th flash day"
              />
            </Field>
            <Field label="Event type">
              <select
                value={form.eventType}
                onChange={(event) => {
                  const eventType = event.target.value as EventType;
                  setForm((current) => {
                    const nextClientAction =
                      current.clientActionType ===
                      getDefaultClientAction(current.eventType, ownerType)
                        ? getDefaultClientAction(eventType, ownerType)
                        : current.clientActionType;

                    return {
                      ...current,
                      eventType,
                      clientActionType: nextClientAction,
                      bookingMode:
                        getBookingModeForClientAction(nextClientAction),
                      capacity: isShopFlashReservation(
                        nextClientAction,
                        ownerType
                      )
                        ? ""
                        : current.capacity,
                    };
                  });
                }}
                className="w-full rounded-md border border-white/10 bg-[#171717] px-3 py-2 text-white outline-none focus:border-white/30"
              >
                {Object.entries(eventTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
            <Field label="Client action">
              <select
                value={form.clientActionType}
                onChange={(event) => {
                  const nextClientAction =
                    event.target.value as EventClientActionType;

                  setForm((current) => ({
                    ...current,
                    clientActionType: nextClientAction,
                    bookingMode: getBookingModeForClientAction(nextClientAction),
                    capacity: isShopFlashReservation(
                      nextClientAction,
                      ownerType
                    )
                      ? ""
                      : current.capacity,
                    priceType:
                      nextClientAction === "paid_event_pass"
                        ? "fixed"
                        : current.priceType,
                    depositRequired: false,
                    depositAmount: "",
                    externalLabel:
                      nextClientAction === "external_link"
                        ? current.externalLabel || "Open event link"
                        : current.externalLabel,
                  }));
                }}
                className="w-full rounded-md border border-white/10 bg-[#171717] px-3 py-2 text-white outline-none focus:border-white/30"
              >
                {eventClientActionOptions.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-sm font-semibold text-white">
                {clientActionLabels[form.clientActionType]}
              </p>
              <p className="mt-1 text-sm leading-6 text-white/50">
                {getClientActionHelp(form.clientActionType, ownerType)}
              </p>
            </div>
          </div>

          {ownerType === "shop" &&
            (form.clientActionType === "flash_reservation" ||
              form.clientActionType === "appointment_request" ||
              form.clientActionType === "waitlist") && (
              <ShopEventArtistSelector
                artists={shopRosterArtists}
                selectedArtistIds={form.participantArtistIds}
                error={formErrors.participantArtistIds}
                onChange={(participantArtistIds) =>
                  setForm((current) => ({
                    ...current,
                    participantArtistIds,
                  }))
                }
              />
            )}

          {form.clientActionType === "external_link" && (
            <div className="grid gap-4 md:grid-cols-[1fr_0.7fr]">
              <Field label="External URL" error={formErrors.externalUrl}>
                <input
                  value={form.externalUrl}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      externalUrl: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
                  placeholder="https://..."
                />
              </Field>
              <Field label="Button label">
                <input
                  value={form.externalLabel}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      externalLabel: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
                  placeholder="Open event link"
                />
              </Field>
            </div>
          )}

          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              rows={4}
              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
              placeholder="Describe what clients should know before they show up."
            />
          </Field>

            </>
          )}

          {activeStep === "schedule" && (
            <>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Start date" error={formErrors.startDate}>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startDate: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
              />
            </Field>
            <Field label="Start time">
              <input
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    startTime: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
              />
            </Field>
            <Field label="End date">
              <input
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endDate: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                value={form.endTime}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endTime: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
              />
            </Field>
          </div>

          {(formErrors.dateRange || formErrors.timeRange) && (
            <ValidationCallout
              message={formErrors.dateRange || formErrors.timeRange || ""}
            />
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Location type" error={formErrors.location}>
              <select
                value={form.locationType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    locationType: event.target.value as EventLocationType,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-[#171717] px-3 py-2 text-white outline-none focus:border-white/30"
              >
                <option value="shop">Shop</option>
                <option value="custom">Custom</option>
                <option value="online">Online</option>
                <option value="tbd">TBD</option>
              </select>
            </Field>
            <Field label="Location name">
              <input
                value={form.shopName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    shopName: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
                placeholder="Shop or venue name"
              />
            </Field>
            <Field label="Map link">
              <input
                value={form.mapLink}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mapLink: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
                placeholder="https://maps.google.com/..."
              />
            </Field>
          </div>

          <Field label="Address">
            <input
              value={form.address}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-white/30"
              placeholder="Street address, city, state"
            />
          </Field>

            </>
          )}

          {activeStep === "pricing" && (
            <>
          {clientActionRequiresStripe(form.clientActionType) && !stripeReady && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-100">
                    Stripe Connect is required for paid event booking.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-100/70">
                    You can save this event as a draft, but publishing paid
                    event passes requires a connected Stripe account.
                  </p>
                </div>
                {onOpenPayments && (
                  <button
                    type="button"
                    onClick={onOpenPayments}
                    className="shrink-0 rounded-md bg-white px-4! py-2! text-sm! font-semibold text-black transition hover:bg-white/85"
                  >
                    Go to Payments
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-sky-300/20 bg-sky-300/10 p-4">
            <p className="text-sm font-semibold text-sky-100">
              {getClientActionPricingTitle(form.clientActionType, ownerType)}
            </p>
            <p className="mt-1 text-sm leading-6 text-sky-100/70">
              {getClientActionPricingHelp(form.clientActionType, ownerType)}
            </p>
          </div>

          <div
            className={`grid gap-4 ${
              usesArtistManagedFlashInventory
                ? showDisplayAmount
                  ? "md:grid-cols-[1.15fr_0.85fr]"
                  : "md:grid-cols-[1.15fr]"
                : "md:grid-cols-[1.15fr_0.85fr_0.85fr]"
            }`}
          >
            <Field
              label={
                usesArtistManagedFlashInventory
                  ? "Flash pricing display"
                  : form.clientActionType !== "free_rsvp" &&
                form.clientActionType !== "paid_event_pass"
                  ? "Displayed price"
                  : "Price type"
              }
            >
              <select
                value={form.priceType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priceType: event.target.value as EventPriceType,
                    price:
                      event.target.value === "free" ||
                      event.target.value === "varies"
                        ? ""
                        : current.price,
                  }))
                }
                className="h-[42px] w-full rounded-md border border-white/10 bg-[#171717] px-3 text-white outline-none transition focus:border-white/30"
              >
                {Object.entries(priceTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            {showDisplayAmount && (
              <Field
                label={
                  form.clientActionType === "paid_event_pass"
                    ? "Pass price"
                    : form.clientActionType !== "free_rsvp"
                    ? "Display amount"
                    : "Price"
                }
              >
                <input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                  className="h-[42px] w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
                  placeholder={
                    form.priceType === "starting_at"
                      ? "Starting price"
                      : "Fixed price"
                  }
                />
              </Field>
            )}

            {!usesArtistManagedFlashInventory && (
              <Field
                label={
                  form.clientActionType === "details_only" ||
                  form.clientActionType === "external_link"
                    ? "Venue capacity"
                    : form.clientActionType === "waitlist"
                    ? "Queue size"
                    : "Capacity"
                }
              >
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      capacity: event.target.value,
                    }))
                  }
                  className="h-[42px] w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
                  placeholder={
                    form.clientActionType === "details_only" ||
                    form.clientActionType === "external_link"
                      ? "Optional"
                      : "100"
                  }
                />
              </Field>
            )}
          </div>
          {usesArtistManagedFlashInventory ? (
            <p className="text-xs leading-5 text-white/35">
              Flash availability is managed by the participating artists. Each
              artist decides which SATX flash sheets or flash pieces are
              available for this shop event, so the shop does not set a
              capacity here.
            </p>
          ) : (form.clientActionType === "details_only" ||
            form.clientActionType === "external_link") && (
            <p className="text-xs leading-5 text-white/35">
              Capacity is optional for awareness-only events and is shown as
              venue context only. For tattoo work, use an appointment,
              waitlist, or flash-reservation action to keep the lead on SATX.
            </p>
          )}

          {(formErrors.price ||
            formErrors.depositAmount ||
            formErrors.capacity ||
            formErrors.stripe) && (
            <ValidationCallout
              message={
                formErrors.price ||
                formErrors.depositAmount ||
                formErrors.capacity ||
                formErrors.stripe ||
                ""
              }
            />
          )}

            </>
          )}

          {activeStep === "publish" && (
            <>
          <EventReviewSummary
            form={form}
            ownerType={ownerType}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as EventStatus,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-[#171717] px-3 py-2 text-white outline-none focus:border-white/30"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
              </select>
            </Field>

            <Field label="Visibility">
              <select
                value={form.visibility}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    visibility: event.target.value as "public" | "private",
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-[#171717] px-3 py-2 text-white outline-none focus:border-white/30"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </Field>
          </div>

          <Field label="Tags">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 transition focus-within:border-white/30 focus-within:bg-white/[0.06]">
              <div className="flex min-h-[32px] flex-wrap items-center gap-2">
                {form.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        tags: current.tags.filter((item) => item !== tag),
                      }))
                    }
                    className="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3! py-1.5! text-xs! font-semibold text-white/75 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-100"
                  >
                    #{tag}
                    <span className="text-white/35 transition group-hover:text-red-200">
                      ×
                    </span>
                  </button>
                ))}

                <input
                  value={form.tagDraft}
                  onChange={(event) => {
                    const value = event.target.value;

                    if (value.includes(",") || /\s$/.test(value)) {
                      commitEventTags(setForm, value);
                      return;
                    }

                    setForm((current) => ({
                      ...current,
                      tagDraft: value,
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitEventTags(setForm, form.tagDraft);
                    }

                    if (
                      event.key === "Backspace" &&
                      !form.tagDraft &&
                      form.tags.length > 0
                    ) {
                      setForm((current) => ({
                        ...current,
                        tags: current.tags.slice(0, -1),
                      }));
                    }
                  }}
                  onBlur={() => commitEventTags(setForm, form.tagDraft)}
                  className="min-w-[160px] flex-1 bg-transparent px-1 py-1 text-sm text-white outline-none placeholder:text-white/30"
                  placeholder={
                    form.tags.length
                      ? "Add another tag"
                      : "Type a tag, then press comma or space"
                  }
                />
              </div>
            </div>

            <p className="mt-2 text-xs text-white/35">
              Tags become searchable pills for event discovery.
            </p>
          </Field>

            </>
          )}

        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 bg-[#101010]/95 px-5 py-4 shadow-[0_-18px_30px_rgba(0,0,0,0.35)] backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-sm text-white/45">
            {hasCurrentStepErrors
              ? getFirstStepError(activeStep, formErrors)
              : !canSave
              ? getFirstEventFormError(formErrors)
              : isFinalStep
              ? "Review the event before saving."
              : "This step looks ready."}
          </p>
          <div className="flex shrink-0 justify-end gap-3">
            <button
              type="button"
              onClick={currentStepIndex === 0 ? onClose : goToPreviousStep}
              className="rounded-md bg-white/[0.06] px-4! py-2! text-sm! text-white/75 hover:bg-white/[0.1]"
            >
              {currentStepIndex === 0 ? (
                "Cancel"
              ) : (
                <span className="inline-flex items-center gap-2">
                  <ChevronLeft size={16} />
                  Back
                </span>
              )}
            </button>
            {!isFinalStep ? (
              <button
                type="button"
                onClick={goToNextStep}
                className="inline-flex items-center gap-2 rounded-md bg-white px-4! py-2! text-sm! font-semibold text-black hover:bg-white/85"
              >
                Continue
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSave}
                disabled={isSaving || !canSave}
                className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4! py-2! text-sm! font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving && <Loader2 className="animate-spin" size={16} />}
                {isSaving ? "Saving..." : editingEvent ? "Save Event" : "Create Event"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

const EventStat = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.035] p-2">
    <p className="text-sm text-white/45">{label}</p>
    <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
  </div>
);

const EventMeta = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="flex items-center gap-2">
    <span className="text-white/35">{icon}</span>
    <span className="truncate">{text}</span>
  </div>
);

const EventStepTabs = ({
  activeStep,
  errors,
  onSelect,
}: {
  activeStep: EventEditorStepKey;
  errors: EventFormErrors;
  onSelect: (step: EventEditorStepKey) => void;
}) => (
  <div className="border-b border-white/10 bg-black/20 px-5 py-4">
    <div className="grid gap-2 md:grid-cols-4">
      {eventEditorSteps.map((step, index) => {
        const isActive = activeStep === step.key;
        const hasErrors = stepHasErrors(step.key, errors);

        return (
          <button
            key={step.key}
            type="button"
            onClick={() => onSelect(step.key)}
            className={`rounded-xl border p-3! text-left transition ${
              isActive
                ? "border-white/25 bg-white/[0.09] text-white"
                : "border-white/10 bg-white/[0.025] text-white/55 hover:border-white/20 hover:text-white"
            }`}
          >
            <span
              className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
                hasErrors
                  ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                  : isActive
                  ? "border-white bg-white text-black"
                  : "border-white/15 bg-white/[0.04] text-white/55"
              }`}
            >
              {hasErrors ? <Info size={14} /> : <Check size={14} />}
            </span>
            <p className="text-sm font-semibold">
              {index + 1}. {step.title}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/40">
              {step.description}
            </p>
          </button>
        );
      })}
    </div>
  </div>
);

const ShopEventArtistSelector = ({
  artists,
  selectedArtistIds,
  error,
  onChange,
}: {
  artists: ShopRosterArtist[];
  selectedArtistIds: string[];
  error?: string;
  onChange: (artistIds: string[]) => void;
}) => {
  const toggleArtist = (artistId: string) => {
    onChange(
      selectedArtistIds.includes(artistId)
        ? selectedArtistIds.filter((id) => id !== artistId)
        : [...selectedArtistIds, artistId]
    );
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            Participating artists
          </p>
          <p className="mt-1 text-sm leading-6 text-white/50">
            Shop events should point clients back to the artists who can take
            SATX bookings, flash reservations, or waitlist follow-ups.
          </p>
        </div>
        <span className="text-xs font-semibold text-white/35">
          {selectedArtistIds.length} selected
        </span>
      </div>

      {artists.length === 0 ? (
        <p className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100/80">
          Add artists to this shop roster before publishing shop events that
          depend on artist participation.
        </p>
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {artists.map((artist) => {
            const isSelected = selectedArtistIds.includes(artist.id);
            const artistName = artist.displayName || artist.name || "Artist";

            return (
              <button
                key={artist.id}
                type="button"
                onClick={() => toggleArtist(artist.id)}
                className={`flex items-center gap-3 rounded-lg border p-3! text-left transition ${
                  isSelected
                    ? "border-[var(--color-primary)]/45 bg-[var(--color-primary)]/12"
                    : "border-white/10 bg-black/20 hover:border-white/25"
                }`}
              >
                <img
                  src={artist.avatarUrl || "/default-avatar.png"}
                  alt={artistName}
                  className="h-10 w-10 rounded-full border border-white/10 object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">
                    {artistName}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/40">
                    SATX artist roster
                  </span>
                </span>
                <span
                  className={`h-4 w-4 rounded-full border ${
                    isSelected
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]"
                      : "border-white/25"
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ValidationCallout message={error} />
        </div>
      )}
    </div>
  );
};

const ValidationCallout = ({ message }: { message: string }) => (
  <div className="flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
    <Info className="mt-0.5 shrink-0" size={16} />
    <p className="leading-6">{message}</p>
  </div>
);

const EventReviewSummary = ({
  form,
  ownerType,
}: {
  form: EventFormState;
  ownerType: "artist" | "shop";
}) => {
  const usesArtistManagedFlashInventory = isShopFlashReservation(
    form.clientActionType,
    ownerType
  );
  const dateLabel = form.startDate
    ? `${form.startDate}${form.startTime ? ` at ${formatTime(form.startTime)}` : ""}`
    : "Date not set";
  const priceLabel =
    form.clientActionType === "paid_event_pass"
      ? `Event pass ${formatCurrency(form.price)}`
      : form.clientActionType !== "free_rsvp"
      ? getDisplayPriceLabel(form)
      : priceTypeLabels[form.priceType];

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-[var(--color-primary)]/15 p-2 text-[var(--color-primary)]">
          <Sparkles size={18} />
        </span>
        <div>
          <p className="text-sm font-semibold text-white">Event preview</p>
          <p className="mt-1 text-sm leading-6 text-white/50">
            This is the version visitors will understand at a glance before
            they decide to RSVP, reserve, or show up.
          </p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10 bg-black/20">
        <ReviewRow
          label="Host type"
          value={ownerType === "shop" ? "Shop event" : "Artist event"}
        />
        <ReviewRow label="Title" value={form.title || "Untitled event"} />
        <ReviewRow label="Type" value={eventTypeLabels[form.eventType]} />
        <ReviewRow
          label="Client action"
          value={clientActionLabels[form.clientActionType]}
        />
        <ReviewRow label="Starts" value={dateLabel} />
        <ReviewRow
          label="Location"
          value={
            form.locationType === "online"
              ? "Online"
              : form.locationType === "tbd"
              ? "Location TBD"
              : form.shopName || form.address || "Location not set"
          }
        />
        <ReviewRow label="Price display" value={priceLabel} />
        <ReviewRow
          label={
            usesArtistManagedFlashInventory
              ? "Flash availability"
              : form.clientActionType === "details_only" ||
            form.clientActionType === "external_link"
              ? "Venue capacity"
              : form.clientActionType === "waitlist"
              ? "Queue size"
              : "Capacity"
          }
          value={
            usesArtistManagedFlashInventory
              ? "Managed by participating artists"
              : form.capacity ||
            (form.clientActionType === "details_only" ||
            form.clientActionType === "external_link"
              ? "Not shown"
              : "Not set")
          }
        />
        {form.clientActionType === "external_link" && (
          <ReviewRow
            label="External link"
            value={form.externalUrl || "Not set"}
          />
        )}
        {ownerType === "shop" && form.participantArtistIds.length > 0 && (
          <ReviewRow
            label="Artists"
            value={`${form.participantArtistIds.length} participating`}
          />
        )}
      </div>
    </div>
  );
};

const ReviewRow = ({ label, value }: { label: string; value: string }) => (
  <div className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
    <span className="text-white/40">{label}</span>
    <span className="font-semibold text-white/80">{value}</span>
  </div>
);

const Field = ({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) => (
  <label className="block">
    <span className="mb-2 block whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
      {label}
    </span>
    {children}
    {error && <span className="mt-2 block text-xs text-amber-200">{error}</span>}
  </label>
);
const EventsSkeleton = () => (
  <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
    {[0, 1, 2, 3].map((item) => (
      <div
        key={item}
        className="h-[240px] animate-pulse rounded-xl border border-white/10 bg-white/[0.035]"
      />
    ))}
  </div>
);

const uploadEventThumbnail = async (
  uid: string,
  eventId: string,
  file: File
) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const thumbnailPath = `users/${uid}/events/${eventId}-${Date.now()}-${safeName}`;
  const storageRef = ref(storage, thumbnailPath);

  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
  });

  const thumbnailUrl = await getDownloadURL(storageRef);
  return { thumbnailUrl, thumbnailPath };
};

const eventBelongsToShop = (event: ArtistEvent, shop: ShopDefaults) =>
  event.shopId === shop.id ||
  (!event.shopId &&
    Boolean(event.shopName) &&
    event.shopName === (shop.name || ""));

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getEventFormErrors = (
  form: EventFormState,
  stripeReady: boolean,
  ownerType: "artist" | "shop"
): EventFormErrors => {
  const errors: EventFormErrors = {};
  const usesArtistManagedFlashInventory = isShopFlashReservation(
    form.clientActionType,
    ownerType
  );
  const parsedCapacity = usesArtistManagedFlashInventory
    ? null
    : parseOptionalNumber(form.capacity);
  const parsedPrice = parseOptionalNumber(form.price);
  const capacityRequired =
    form.clientActionType === "free_rsvp" ||
    form.clientActionType === "paid_event_pass";
  const paidAction = form.clientActionType === "paid_event_pass";

  if (!form.title.trim()) {
    errors.title = "Add a clear event title.";
  }

  if (!form.startDate) {
    errors.startDate = "Choose the start date.";
  }

  if (form.endDate && form.startDate && form.endDate < form.startDate) {
    errors.dateRange = "End date cannot be before the start date.";
  }

  if (
    form.endDate &&
    form.startDate &&
    form.endDate === form.startDate &&
    form.startTime &&
    form.endTime &&
    form.endTime <= form.startTime
  ) {
    errors.timeRange = "End time must be later than the start time.";
  }

  if (
    (form.locationType === "shop" || form.locationType === "custom") &&
    !form.shopName.trim() &&
    !form.address.trim()
  ) {
    errors.location = "Add a shop, venue name, or address.";
  }

  if (
    (form.priceType === "fixed" || form.priceType === "starting_at") &&
    (!parsedPrice || parsedPrice <= 0)
  ) {
    errors.price = "Add a valid price for this price type.";
  }

  if (
    paidAction &&
    (!parsedPrice || parsedPrice <= 5)
  ) {
    errors.price =
      "Paid event pass prices must be greater than the platform fee.";
  }

  if (capacityRequired && (!parsedCapacity || parsedCapacity <= 0)) {
    errors.capacity = "Add a valid event capacity.";
  }

  if (
    !capacityRequired &&
    parsedCapacity !== null &&
    parsedCapacity <= 0
  ) {
    errors.capacity = "Use a positive capacity or leave it blank.";
  }

  if (form.clientActionType === "external_link") {
    if (!form.externalUrl.trim()) {
      errors.externalUrl = "Add the external event link.";
    } else if (!/^https?:\/\//i.test(form.externalUrl.trim())) {
      errors.externalUrl = "External links must start with http:// or https://.";
    }
  }

  if (
    form.status === "published" &&
    ownerType === "shop" &&
    (form.clientActionType === "flash_reservation" ||
      form.clientActionType === "appointment_request" ||
      form.clientActionType === "waitlist") &&
    form.participantArtistIds.length === 0
  ) {
    errors.participantArtistIds =
      "Pick at least one participating artist so clients can continue through SATX.";
  }

  if (
    form.status === "published" &&
    clientActionRequiresStripe(form.clientActionType) &&
    !stripeReady
  ) {
    errors.stripe = "Connect Stripe before publishing paid event passes.";
  }

  return errors;
};

const getFirstEventFormError = (errors: EventFormErrors) =>
  Object.values(errors).find(Boolean) || "";

const getFirstStepError = (
  step: EventEditorStepKey,
  errors: EventFormErrors
) => stepErrorKeys[step].map((key) => errors[key]).find(Boolean) || "";

const stepHasErrors = (step: EventEditorStepKey, errors: EventFormErrors) =>
  Boolean(getFirstStepError(step, errors));

const formatCurrency = (value: string) => {
  const parsed = parseOptionalNumber(value);
  if (!parsed) return "$0";
  return `$${parsed.toLocaleString()}`;
};

const getDisplayPriceLabel = (form: EventFormState) => {
  if (form.priceType === "free") return "Free";
  if (form.priceType === "varies") return "Pricing varies";
  if (form.priceType === "starting_at") {
    return `Starting at ${formatCurrency(form.price)}`;
  }
  if (form.priceType === "fixed") return formatCurrency(form.price);
  return priceTypeLabels[form.priceType];
};

const getEventClientActionType = (
  event: Pick<
    ArtistEvent,
    "clientActionType" | "bookingMode" | "eventType" | "ownerType"
  >
): EventClientActionType => {
  if (event.clientActionType) return event.clientActionType;
  if (event.bookingMode === "rsvp") return "free_rsvp";
  if (event.bookingMode === "paid_ticket") return "paid_event_pass";
  if (event.bookingMode === "flash_reservation") return "flash_reservation";
  if (event.bookingMode === "deposit_required") return "appointment_request";
  return getDefaultClientAction(event.eventType, event.ownerType || "artist");
};

const getDefaultClientAction = (
  eventType: EventType,
  ownerType: "artist" | "shop"
): EventClientActionType => {
  if (eventType === "flash_day") return "flash_reservation";
  if (eventType === "guest_spot") return "appointment_request";
  if (eventType === "walk_in_day") return "waitlist";
  if (eventType === "convention") return "appointment_request";
  if (eventType === "pop_up") return ownerType === "shop" ? "free_rsvp" : "appointment_request";
  if (eventType === "shop_event") return ownerType === "shop" ? "free_rsvp" : "details_only";
  return "details_only";
};

const getBookingModeForClientAction = (
  clientActionType: EventClientActionType
): EventBookingMode => {
  if (clientActionType === "free_rsvp") return "rsvp";
  if (clientActionType === "paid_event_pass") return "paid_ticket";
  return "info_only";
};

const clientActionRequiresStripe = (clientActionType: EventClientActionType) =>
  clientActionType === "paid_event_pass";

const isShopFlashReservation = (
  clientActionType: EventClientActionType,
  ownerType?: "artist" | "shop"
) => ownerType === "shop" && clientActionType === "flash_reservation";

const getClientActionHelp = (
  clientActionType: EventClientActionType,
  ownerType: "artist" | "shop"
) => {
  if (clientActionType === "details_only") {
    return "Best for announcements. Use this when the event should inform clients but not replace SATX booking flows.";
  }

  if (clientActionType === "free_rsvp") {
    return "Clients can RSVP for reminders and check-in, but the RSVP does not reserve a tattoo spot.";
  }

  if (clientActionType === "paid_event_pass") {
    return "For admission-style events such as workshops, private previews, expos, or VIP access. Payment stays on SATX.";
  }

  if (clientActionType === "flash_reservation") {
    return ownerType === "shop"
      ? "For shop flash days. Pick participating artists so clients are pushed toward SATX artist flash and booking flows."
      : "For artist flash days. Clients are steered toward SATX flash inventory and profile booking instead of offline claims.";
  }

  if (clientActionType === "appointment_request") {
    return "Best for guest spots and convention dates. The event should drive clients to request work through SATX.";
  }

  if (clientActionType === "waitlist") {
    return "Best for walk-in days. Use it to capture demand and convert clients into SATX requests instead of unmanaged door traffic.";
  }

  return "Use only when the event must be completed on an external site, such as convention admission or a venue-run event page.";
};

const getClientActionPricingTitle = (
  clientActionType: EventClientActionType,
  ownerType: "artist" | "shop"
) => {
  if (clientActionType === "paid_event_pass") {
    return "Paid event passes keep admission payments on SATX Ink.";
  }
  if (clientActionType === "free_rsvp") {
    return "Free RSVP creates attendance passes, not tattoo appointments.";
  }
  if (clientActionType === "flash_reservation") {
    if (ownerType === "shop") {
      return "Shop flash days use artist-managed flash availability.";
    }
    return "Flash events should drive clients toward SATX flash booking.";
  }
  if (clientActionType === "appointment_request") {
    return "Appointment events should convert into SATX tattoo requests.";
  }
  if (clientActionType === "waitlist") {
    return "Walk-in interest should stay captured inside SATX.";
  }
  if (clientActionType === "external_link") {
    return "External links should be the exception, not the default.";
  }
  return "Details-only events do not collect money on SATX Ink.";
};

const getClientActionPricingHelp = (
  clientActionType: EventClientActionType,
  ownerType: "artist" | "shop"
) => {
  if (clientActionType === "paid_event_pass") {
    return "Clients pay through Stripe, receive a QR pass in their dashboard, and can be checked in by the host.";
  }
  if (clientActionType === "free_rsvp") {
    return "Use RSVP for headcount and reminders. The public event copy clarifies that tattoo spots still need to be requested or reserved through SATX.";
  }
  if (clientActionType === "flash_reservation") {
    if (ownerType === "shop") {
      return "Use this as a shop-level price cue only. Each participating artist should control which SATX flash sheets or pieces are reservable for this event.";
    }
    return "Use displayed price as public context. The event CTA prioritizes SATX flash/profile flows so clients do not treat the event as an offline booking workaround.";
  }
  if (clientActionType === "appointment_request") {
    return "Use displayed price as estimate context. The event CTA points to SATX profile/request flows where custom tattoo booking belongs.";
  }
  if (clientActionType === "waitlist") {
    return "Capacity can represent queue size. The event should capture interest and route clients into SATX follow-up, not unmanaged walk-in booking.";
  }
  if (clientActionType === "external_link") {
    return "Use displayed price as context only. Prefer SATX actions unless a convention, venue, or organizer requires an external link.";
  }
  return "Use price only as public display context, such as Free, Varies, or Starting at.";
};

const getClientActionDashboardNote = (
  clientActionType: EventClientActionType
) => eventClientActionOptions.find((option) => option.value === clientActionType)?.note || "";

const getEventManagerCallableErrorMessage = (error: unknown, fallback: string) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return fallback;
};

const normalizeEventTag = (value: string) =>
  value.trim().replace(/^#/, "").toLowerCase();

const commitEventTags = (
  setForm: React.Dispatch<React.SetStateAction<EventFormState>>,
  rawValue: string
) => {
  const nextTags = rawValue
    .split(/[,\s]+/)
    .map(normalizeEventTag)
    .filter(Boolean);

  if (!nextTags.length) return;

  setForm((current) => ({
    ...current,
    tags: Array.from(new Set([...current.tags, ...nextTags])),
    tagDraft: "",
  }));
};

const getDefaultBookingMode = (eventType: EventType): EventBookingMode => {
  if (
    eventType === "flash_day" ||
    eventType === "walk_in_day" ||
    eventType === "shop_event"
  ) {
    return "rsvp";
  }

  if (eventType === "pop_up" || eventType === "convention") {
    return "info_only";
  }

  return "rsvp";
};

const eventModeRequiresPayment = (bookingMode: EventBookingMode) =>
  bookingMode === "deposit_required" ||
  bookingMode === "flash_reservation" ||
  bookingMode === "paid_ticket";

const getEventTime = (event: ArtistEvent) => {
  if (!event.startDate) return Number.MAX_SAFE_INTEGER;
  return new Date(`${event.startDate}T${event.startTime || "00:00"}`).getTime();
};

const isUpcomingEvent = (event: ArtistEvent) =>
  event.status === "published" && getEventTime(event) >= Date.now();

const formatEventDate = (event: ArtistEvent) => {
  if (!event.startDate) return "Date TBD";
  const date = new Date(`${event.startDate}T${event.startTime || "00:00"}`);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return event.startTime
    ? `${dateLabel} at ${formatTime(event.startTime)}`
    : dateLabel;
};

const formatTime = (time: string) => {
  const [hours, minutes] = time.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes || 0));
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getLocationLabel = (event: ArtistEvent) => {
  if (event.locationType === "online") return "Online";
  if (event.locationType === "tbd") return "Location TBD";
  return event.shopName || event.address || "Location TBD";
};

const getEventCapacityLabel = (
  event: ArtistEvent,
  registrationCount?: number
) => {
  const clientActionType = getEventClientActionType(event);

  if (isShopFlashReservation(clientActionType, event.ownerType)) {
    return "Artist-managed flash availability";
  }

  if (
    clientActionType === "details_only" ||
    clientActionType === "external_link"
  ) {
    return event.capacity ? `Venue capacity ${event.capacity}` : "Details only";
  }

  if (clientActionType === "waitlist") {
    return event.capacity
      ? `${event.capacity} queue spots`
      : "SATX waitlist interest";
  }

  if (
    clientActionType === "appointment_request" ||
    clientActionType === "flash_reservation"
  ) {
    return event.capacity ? `${event.capacity} booking slots` : "SATX booking flow";
  }

  return `${registrationCount || event.spotsClaimed || 0}/${
    event.capacity || 0
  } spots claimed`;
};

const getPriceLabel = (event: ArtistEvent) => {
  const hasDeposit =
    event.bookingMode !== "info_only" &&
    (Boolean(event.depositRequired) ||
      (event.priceType as string) === "deposit_required" ||
      (typeof event.depositAmount === "number" && event.depositAmount > 0));

  const depositLabel =
    hasDeposit && event.depositAmount
      ? `$${event.depositAmount} deposit`
      : hasDeposit
      ? "Deposit required"
      : "";

  let priceLabel = "Price TBD";

  if (event.priceType === "free") priceLabel = "Free";
  else if (event.priceType === "varies") priceLabel = "Pricing varies";
  else if (event.priceType === "starting_at") {
    priceLabel = event.price
      ? `Starting at $${event.price}`
      : "Starting price TBD";
  } else {
    priceLabel = event.price ? `$${event.price}` : "Price TBD";
  }

  return depositLabel ? `${priceLabel} • ${depositLabel}` : priceLabel;
};

export default EventsManager;
