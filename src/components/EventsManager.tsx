import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  CalendarDays,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  MapPin,
  Pencil,
  Plus,
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
import { db, storage } from "../firebase/firebaseConfig";
import type {
  ArtistEvent,
  EventBookingMode,
  EventLocationType,
  EventPriceType,
  EventStatus,
  EventType,
} from "../types/Event";
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
  price: string;
  depositRequired: boolean;
  depositAmount: string;
  capacity: string;
  tags: string[];
  tagDraft: string;
  status: EventStatus;
  visibility: "public" | "private";
};

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
  bookingMode: "deposit_required",
  price: "",
  depositRequired: false,
  depositAmount: "",
  capacity: "",
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
  shop_event: "Shop Event",
  other: "Other",
};

const priceTypeLabels: Record<EventPriceType, string> = {
  free: "Free",
  fixed: "Fixed Price",
  starting_at: "Starting At",
  varies: "Varies",
};

const bookingModeLabels: Record<EventBookingMode, string> = {
  info_only: "Info only",
  rsvp: "Free RSVP",
  deposit_required: "Deposit required",
  flash_reservation: "Flash reservation",
  paid_ticket: "Paid ticket",
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
}: {
  uid: string;
  artist?: ArtistLite | null;
  onOpenPayments?: () => void;
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
  const stripeReady = isStripeConnectReady(artist);

  const fetchEvents = async () => {
    if (!uid) return;

    try {
      setLoading(true);
      const eventsQuery = query(
        collection(db, "events"),
        where("artistId", "==", uid)
      );
      const snapshot = await getDocs(eventsQuery);
      const result = snapshot.docs.map((eventDoc) => ({
        id: eventDoc.id,
        ...eventDoc.data(),
      })) as ArtistEvent[];

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
  }, [uid]);

  useEffect(() => {
    let isMounted = true;

    const fetchShopDefaults = async () => {
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
  }, [artist?.shopId]);

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
    setEditingEvent(null);
    setForm({
      ...emptyForm,
      shopName: shopDefaults?.name || artist?.studioName || "",
      address: shopDefaults?.address || "",
      mapLink: shopDefaults?.mapLink || "",
    });
    setThumbnailFile(null);
    setIsModalOpen(true);
  };

  const openEditModal = (event: ArtistEvent) => {
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
      bookingMode: event.bookingMode || getDefaultBookingMode(event.eventType),
      price: typeof event.price === "number" ? String(event.price) : "",
      depositRequired:
        Boolean(event.depositRequired) ||
        (event.priceType as string) === "deposit_required" ||
        (typeof event.depositAmount === "number" && event.depositAmount > 0),
      depositAmount:
        typeof event.depositAmount === "number"
          ? String(event.depositAmount)
          : "",
      capacity:
        typeof event.capacity === "number" && event.capacity > 0
          ? String(event.capacity)
          : "",
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
    if (!form.title.trim()) {
      toast.error("Add an event title.");
      return;
    }
    if (!form.startDate) {
      toast.error("Choose a start date.");
      return;
    }

    const parsedCapacity = parseOptionalNumber(form.capacity);

    if (!parsedCapacity || parsedCapacity <= 0) {
      toast.error("Add a valid event capacity.");
      return;
    }

    const bookingRequiresDeposit =
      form.bookingMode === "deposit_required" ||
      form.bookingMode === "flash_reservation";
    const bookingRequiresPayment = eventModeRequiresPayment(form.bookingMode);

    if (
      bookingRequiresDeposit &&
      (!Number(form.depositAmount || 0) || Number(form.depositAmount || 0) <= 5)
    ) {
      toast.error("Paid event deposits must be greater than the platform fee.");
      return;
    }

    if (
      form.bookingMode === "paid_ticket" &&
      (!Number(form.price || 0) || Number(form.price || 0) <= 5)
    ) {
      toast.error("Paid event prices must be greater than the platform fee.");
      return;
    }

    if (form.status === "published" && bookingRequiresPayment && !stripeReady) {
      toast.error("Connect Stripe before publishing paid events.");
      return;
    }

    try {
      setIsSaving(true);
      const eventId = editingEvent?.id || `event_${Date.now()}`;
      const imageUpload = thumbnailFile
        ? await uploadEventThumbnail(uid, eventId, thumbnailFile)
        : null;

      const payload = {
        artistId: uid,
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
          form.locationType === "shop"
            ? artist?.shopId || shopDefaults?.id || ""
            : "",
        shopName: form.shopName.trim() || "",
        address: form.address.trim() || "",
        mapLink: form.mapLink.trim() || "",
        priceType: form.priceType,
        bookingMode: form.bookingMode,
        price:
          form.priceType === "free" || form.priceType === "varies"
            ? null
            : parseOptionalNumber(form.price),
        depositRequired:
          bookingRequiresDeposit ||
          (form.depositRequired && Number(form.depositAmount || 0) > 0),
        depositAmount:
          (bookingRequiresDeposit || form.depositRequired) &&
          Number(form.depositAmount || 0) > 0
            ? parseOptionalNumber(form.depositAmount)
            : null,
        capacity: parsedCapacity,
        spotsClaimed: editingEvent?.spotsClaimed || 0,
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

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mt-5 max-w-[800px]">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">
            Artist events
          </p>
          <h2 className="mt-2 text-3xl! font-semibold text-white">Events</h2>
          <p className="max-w-2xl text-sm text-white/50">
            Promote flash days, guest spots, conventions, pop-ups, and shop
            events from one place.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4! py-2! text-sm! font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
        >
          <Plus size={17} />
          Add Event
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 max-w-[500px]">
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
}: {
  event: ArtistEvent;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: EventStatus) => void;
  canPublishPaidEvent: boolean;
}) => {
  const priceLabel = getPriceLabel(event);
  const locationLabel = getLocationLabel(event);
  const requiresPayment = eventModeRequiresPayment(
    event.bookingMode || getDefaultBookingMode(event.eventType)
  );

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
              text={bookingModeLabels[event.bookingMode || getDefaultBookingMode(event.eventType)]}
            />
            <EventMeta
              icon={<Users size={15} />}
              text={`${event.spotsClaimed || 0}/${
                event.capacity || 0
              } spots claimed`}
            />
          </div>

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
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-md">
    <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-xl border border-white/10 bg-[#101010] shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/35">
            {editingEvent ? "Edit event" : "New event"}
          </p>
          <h3 className="text-xl font-semibold text-white">
            {editingEvent ? editingEvent.title : "Create an artist event"}
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

      <div className="grid max-h-[calc(92vh-82px)] overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
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

        <div className="space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title">
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
                  setForm((current) => ({
                    ...current,
                    eventType,
                    bookingMode:
                      current.bookingMode === getDefaultBookingMode(current.eventType)
                        ? getDefaultBookingMode(eventType)
                        : current.bookingMode,
                  }));
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
            <Field label="Booking mode">
              <select
                value={form.bookingMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    bookingMode: event.target.value as EventBookingMode,
                    depositRequired:
                      event.target.value === "deposit_required" ||
                      event.target.value === "flash_reservation"
                        ? true
                        : current.depositRequired,
                  }))
                }
                className="w-full rounded-md border border-white/10 bg-[#171717] px-3 py-2 text-white outline-none focus:border-white/30"
              >
                {Object.entries(bookingModeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <p className="text-sm font-semibold text-white">
                {bookingModeLabels[form.bookingMode]}
              </p>
              <p className="mt-1 text-sm leading-6 text-white/50">
                {getBookingModeHelp(form.bookingMode)}
              </p>
            </div>
          </div>

          {eventModeRequiresPayment(form.bookingMode) && !stripeReady && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-100">
                    Stripe Connect is required for paid event booking.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-100/70">
                    You can save this event as a draft, but publishing it with
                    deposits, flash reservations, or paid tickets requires a
                    connected Stripe account.
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

          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Start date">
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

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Location type">
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

          <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr_1fr_1fr_0.85fr]">
            <Field label="Price type">
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

            <Field label="Price">
              <input
                type="number"
                min="0"
                disabled={
                  form.priceType === "free" || form.priceType === "varies"
                }
                value={form.price}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    price: event.target.value,
                  }))
                }
                className="h-[42px] w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-35 focus:border-white/30"
                placeholder={
                  form.priceType === "starting_at"
                    ? "Starting price"
                    : form.priceType === "fixed"
                    ? "Fixed price"
                    : "N/A"
                }
              />
            </Field>

            <Field label="Deposit">
              <div className="flex h-[42px] items-center rounded-md border border-white/10 bg-white/[0.04] px-3 transition hover:border-white/25 hover:bg-white/[0.07]">
                <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-white/75">
                  <input
                    type="checkbox"
                    checked={form.depositRequired}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        depositRequired: event.target.checked,
                        depositAmount: event.target.checked
                          ? current.depositAmount
                          : "",
                      }))
                    }
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  Required
                </label>
              </div>
            </Field>

            <Field label="Deposit amount">
              <input
                type="number"
                min="0"
                disabled={!form.depositRequired}
                value={form.depositAmount}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    depositAmount: event.target.value,
                    depositRequired: Number(event.target.value || 0) > 0,
                  }))
                }
                className="h-[42px] w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition disabled:cursor-not-allowed disabled:opacity-35 focus:border-white/30"
                placeholder={form.depositRequired ? "20" : "Off"}
              />
            </Field>

            <Field label="Capacity">
              <input
                type="number"
                min="1"
                required
                value={form.capacity}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    capacity: event.target.value,
                  }))
                }
                className="h-[42px] w-full rounded-md border border-white/10 bg-white/[0.04] px-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/30"
                placeholder="100"
              />
            </Field>
          </div>

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

          <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-white/[0.06] px-4! py-2! text-sm! text-white/75 hover:bg-white/[0.1]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={isSaving}
              className="rounded-md bg-[var(--color-primary)] px-4! py-2! text-sm! font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving
                ? "Saving..."
                : editingEvent
                ? "Save Event"
                : "Create Event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

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

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="block">
    <span className="mb-2 block whitespace-nowrap text-xs font-semibold uppercase tracking-[0.14em] text-white/40">
      {label}
    </span>
    {children}
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

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  if (eventType === "flash_day" || eventType === "guest_spot") {
    return "deposit_required";
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

const getBookingModeHelp = (bookingMode: EventBookingMode) => {
  if (bookingMode === "info_only") {
    return "Best for pop-ups and convention appearances where clients just show up.";
  }

  if (bookingMode === "rsvp") {
    return "Clients can claim a free spot so you can track interest and capacity.";
  }

  if (bookingMode === "deposit_required") {
    return "Clients reserve a general event spot by paying a deposit through Stripe Connect.";
  }

  if (bookingMode === "flash_reservation") {
    return "Use this for Flash Days where clients will reserve specific flash from event-selected sheets.";
  }

  return "Clients pay a fixed event price through Stripe Connect before attending.";
};

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

const getPriceLabel = (event: ArtistEvent) => {
  const hasDeposit =
    Boolean(event.depositRequired) ||
    (event.priceType as string) === "deposit_required" ||
    (typeof event.depositAmount === "number" && event.depositAmount > 0);

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
