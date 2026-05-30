import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  Copy,
  LinkIcon,
  CreditCard,
  LayoutDashboard,
  Pencil,
  Search,
  Store,
  UserMinus,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useSearchParams } from "react-router-dom";
import { auth, db } from "../firebase/firebaseConfig";
import EventsManager from "../components/EventsManager";
import StripeConnectPanel from "../components/StripeConnectPanel";
import type { StripeConnectStatus } from "../types/StripeCheckout";

type ShopRecord = {
  id: string;
  name?: string;
  address?: string;
  mapLink?: string;
  ownerUserIds?: string[];
  [key: string]: unknown;
};

type ShopUser = {
  id: string;
  displayName?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  role?: string;
  shopOwnerShopIds?: string[];
  ownedShopIds?: string[];
  shopClaimStatus?: string;
  paymentType?: string;
  stripeConnect?: Partial<StripeConnectStatus>;
  [key: string]: unknown;
};

type ShopClaim = {
  id: string;
  userId: string;
  shopId: string;
  shopName?: string;
  status: "pending" | "verified" | "approved" | "rejected";
  verificationMethod?: "in_person";
  verificationStatus?: "pending_visit" | "verified_in_person" | "rejected";
  notes?: string;
  adminNotes?: string;
  createdAt?: unknown;
  reviewedAt?: unknown;
};

type ShopArtist = {
  id: string;
  displayName?: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  shopId?: string;
  specialties?: string[];
  isVerified?: boolean | "true" | "false";
  stripeConnect?: {
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    onboardingComplete?: boolean;
  };
};

type ShopView = "artists" | "events" | "profile" | "payments";
type ClaimMode = "existing" | "new";

const ShopDashboardView = () => {
  const [searchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState<ShopUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [shops, setShops] = useState<ShopRecord[]>([]);
  const [claims, setClaims] = useState<ShopClaim[]>([]);
  const [artists, setArtists] = useState<ShopArtist[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [activeView, setActiveView] = useState<ShopView | "profile">("artists");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    let unsubscribeUser: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribeUser?.();
      unsubscribeUser = undefined;

      if (!firebaseUser) {
        setCurrentUser(null);
        setAuthLoading(false);
        return;
      }

      const userRef = doc(db, "users", firebaseUser.uid);
      unsubscribeUser = onSnapshot(
        userRef,
        (snap) => {
          setCurrentUser({
            id: firebaseUser.uid,
            email: firebaseUser.email || "",
            ...(snap.data() || {}),
          } as ShopUser);
          setAuthLoading(false);
        },
        (error) => {
          console.error("Failed to load shop dashboard user:", error);
          setAuthLoading(false);
        }
      );

    });

    return () => {
      unsubscribeUser?.();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "shops"), (snap) => {
      const nextShops = snap.docs
        .map((shopDoc) => ({
          id: shopDoc.id,
          ...shopDoc.data(),
        })) as ShopRecord[];
      nextShops
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );
      setShops(nextShops);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return undefined;

    const claimsQuery = query(
      collection(db, "shopClaims"),
      where("userId", "==", currentUser.id)
    );
    const unsubscribe = onSnapshot(claimsQuery, (snap) => {
      const nextClaims = snap.docs.map((claimDoc) => ({
        id: claimDoc.id,
        ...claimDoc.data(),
      })) as ShopClaim[];
      setClaims(nextClaims);
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  const ownedShopIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...(currentUser?.shopOwnerShopIds || []),
          ...(currentUser?.ownedShopIds || []),
        ])
      ),
    [currentUser?.ownedShopIds, currentUser?.shopOwnerShopIds]
  );

  const ownedShops = useMemo(
    () => shops.filter((shop) => ownedShopIds.includes(shop.id)),
    [ownedShopIds, shops]
  );

  useEffect(() => {
    if (!selectedShopId && ownedShops.length) {
      setSelectedShopId(ownedShops[0].id);
    }
  }, [ownedShops, selectedShopId]);

  const activeShop =
    ownedShops.find((shop) => shop.id === selectedShopId) || ownedShops[0];

  useEffect(() => {
    if (!activeShop?.id) {
      setArtists([]);
      return undefined;
    }

    const artistsQuery = query(
      collection(db, "users"),
      where("role", "==", "artist"),
      where("shopId", "==", activeShop.id)
    );
    const unsubscribe = onSnapshot(artistsQuery, (snap) => {
      const nextArtists = snap.docs
        .map((artistDoc) => ({
          id: artistDoc.id,
          ...artistDoc.data(),
        }))
        .sort((a, b) =>
          getArtistName(a as ShopArtist).localeCompare(
            getArtistName(b as ShopArtist)
          )
        ) as ShopArtist[];
      setArtists(nextArtists);
    });

    return () => unsubscribe();
  }, [activeShop?.id]);

  const filteredArtists = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return artists;

    return artists.filter((artist) =>
      [
        artist.id,
        artist.displayName,
        artist.name,
        artist.email,
        ...(artist.specialties || []),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [artists, searchTerm]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] text-white">
        Loading shop tools...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f0f0f] text-white">
        Please log in to manage a shop.
      </div>
    );
  }

  if (!ownedShops.length) {
    return (
      <ShopClaimExperience
        user={currentUser}
        shops={shops}
        claims={claims}
        initialShopId={searchParams.get("claimShopId") || ""}
      />
    );
  }

  const inviteUrl = activeShop
    ? `${window.location.origin}/signup/artist?shopId=${activeShop.id}`
    : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#121212] via-[#0f0f0f] to-[#121212] pt-20 text-white">
      <div className="flex min-h-screen flex-col md:flex-row">
        <ShopDashboardNavigation
          activeView={activeView}
          artistCount={artists.length}
          inviteUrl={inviteUrl}
          shopName={activeShop?.name || "your shop"}
          onChange={setActiveView}
        />

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 md:px-6 md:pb-16 md:pt-6 lg:pr-8">
          <ShopDashboardHeader
            activeShop={activeShop}
            ownedShops={ownedShops}
            selectedShopId={activeShop?.id || ""}
            onShopChange={setSelectedShopId}
            artistCount={artists.length}
          />

          <section className="mt-5 min-w-0 md:mt-6">
            {activeView === "profile" && activeShop && (
              <ShopProfilePanel shop={activeShop} />
            )}
            {activeView === "artists" && activeShop && (
              <ArtistsPanel
                artists={filteredArtists}
                totalArtists={artists.length}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                shop={activeShop}
                inviteUrl={inviteUrl}
              />
            )}
            {activeView === "events" && activeShop && (
              <EventsManager
                uid={currentUser.id}
                artist={currentUser}
                ownerType="shop"
                shopOverride={activeShop}
                onOpenPayments={() => setActiveView("payments")}
                managerTitle="Shop events"
                managerDescription="Create information-only shop events with optional external RSVP, ticket, convention, or venue links."
              />
            )}
            {activeView === "payments" && (
              <StripeConnectPanel artist={currentUser} />
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

const shopDashboardTabs: Array<{
  key: ShopView;
  label: string;
  icon: React.ReactNode;
}> = [
  { key: "artists", label: "Artists", icon: <Users size={17} /> },
  { key: "events", label: "Events", icon: <CalendarDays size={17} /> },
  { key: "profile", label: "Profile", icon: <Pencil size={17} /> },
  { key: "payments", label: "Payments", icon: <CreditCard size={17} /> },
];

const ShopDashboardNavigation = ({
  activeView,
  artistCount,
  inviteUrl,
  shopName,
  onChange,
}: {
  activeView: ShopView;
  artistCount: number;
  inviteUrl: string;
  shopName: string;
  onChange: (view: ShopView) => void;
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const activeTab =
    shopDashboardTabs.find((tab) => tab.key === activeView) ||
    shopDashboardTabs[0];

  const handleChange = (view: ShopView) => {
    onChange(view);
    setMobileMenuOpen(false);
  };

  return (
    <>
      <div className="sticky top-20 z-40 mx-4 mb-4 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 bg-[#111111]/95 px-3! py-3! text-left shadow-2xl shadow-black/30 backdrop-blur-xl transition hover:border-white/20"
          aria-expanded={mobileMenuOpen}
          aria-label="Open shop dashboard menu"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[var(--color-primary)]">
              <LayoutDashboard size={17} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                Shop dashboard
              </span>
              <span className="block truncate text-sm font-semibold text-white">
                {activeTab.label}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {activeView === "artists" && artistCount > 0 && (
              <CountBadge count={artistCount} active />
            )}
            <ChevronDown
              size={17}
              className={`text-neutral-400 transition-transform ${
                mobileMenuOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </span>
        </button>

        {mobileMenuOpen && (
          <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] overflow-hidden rounded-lg border border-white/10 bg-[#111111] p-2 shadow-2xl shadow-black/50">
            <div className="grid gap-1">
              {shopDashboardTabs.map((tab) => (
                <DashboardTab
                  key={tab.key}
                  active={activeView === tab.key}
                  icon={tab.icon}
                  label={tab.label}
                  count={tab.key === "artists" ? artistCount : undefined}
                  onClick={() => handleChange(tab.key)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="hidden w-64 shrink-0 border-r border-white/5 bg-black/20 p-4 md:block md:sticky md:top-20 md:h-[calc(100vh-5rem)] md:self-start">
        <nav className="space-y-2">
          {shopDashboardTabs.map((tab) => (
            <DashboardTab
              key={tab.key}
              active={activeView === tab.key}
              icon={tab.icon}
              label={tab.label}
              count={tab.key === "artists" ? artistCount : undefined}
              onClick={() => onChange(tab.key)}
            />
          ))}
        </nav>
        <div className="mt-5">
          <InviteCard inviteUrl={inviteUrl} shopName={shopName} />
        </div>
      </aside>
    </>
  );
};

const ShopDashboardHeader = ({
  activeShop,
  ownedShops,
  selectedShopId,
  onShopChange,
  artistCount,
}: {
  activeShop?: ShopRecord;
  ownedShops: ShopRecord[];
  selectedShopId: string;
  onShopChange: (shopId: string) => void;
  artistCount: number;
}) => (
  <section className="rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-2xl md:p-5">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[var(--color-primary)] sm:flex">
          <Store size={21} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Shop dashboard
          </p>
          <h1 className="mt-1 truncate text-2xl! font-semibold text-white md:text-3xl!">
            {activeShop?.name || "Your shop"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            Manage your SATX Ink shop presence, invite artists, keep
            affiliations clean, and publish shop-hosted events.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_minmax(0,420px)] lg:min-w-[640px] lg:grid-cols-[260px_1fr]">
        {ownedShops.length > 1 ? (
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
              Managing
            </span>
            <select
              value={selectedShopId}
              onChange={(event) => onShopChange(event.target.value)}
              className="h-10 w-full rounded-md border border-white/10 bg-[#101010] px-3 text-sm text-white outline-none transition focus:border-white/25"
            >
              {ownedShops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name || shop.id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="hidden sm:block" />
        )}

        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            icon={<Users size={15} />}
            label="Artists"
            value={artistCount}
          />
          <MetricCard
            icon={<CalendarDays size={15} />}
            label="Events"
            value="Manage"
          />
          <MetricCard
            icon={<CheckCircle2 size={15} />}
            label="Ownership"
            value="Verified"
          />
        </div>
      </div>
    </div>
  </section>
);

const ShopClaimExperience = ({
  user,
  shops,
  claims,
  initialShopId,
}: {
  user: ShopUser;
  shops: ShopRecord[];
  claims: ShopClaim[];
  initialShopId?: string;
}) => {
  const [claimMode, setClaimMode] = useState<ClaimMode>(
    initialShopId ? "existing" : "existing"
  );
  const [selectedShopId, setSelectedShopId] = useState(initialShopId || "");
  const [newShopName, setNewShopName] = useState("");
  const [newShopAddress, setNewShopAddress] = useState("");
  const [newShopMapLink, setNewShopMapLink] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const latestClaim = claims
    .slice()
    .sort((a, b) => getRecordTime(b.createdAt) - getRecordTime(a.createdAt))[0];

  const selectedShop = shops.find((shop) => shop.id === selectedShopId);
  const requestedShopName = newShopName.trim();

  const handleSubmit = async () => {
    if (claimMode === "existing" && (!selectedShop || !user.id)) {
      toast.error("Choose the shop you want to claim.");
      return;
    }
    if (claimMode === "new" && !requestedShopName) {
      toast.error("Add the shop name you want to register.");
      return;
    }

    try {
      setSubmitting(true);
      await addDoc(collection(db, "shopClaims"), {
        userId: user.id,
        claimantName: user.displayName || user.name || "",
        claimantEmail: user.email || "",
        claimantRole: user.role || "client",
        claimType: claimMode,
        shopId: claimMode === "existing" ? selectedShop?.id || "" : "",
        shopName:
          claimMode === "existing" ? selectedShop?.name || "" : requestedShopName,
        requestedShop:
          claimMode === "new"
            ? {
                name: requestedShopName,
                address: newShopAddress.trim(),
                mapLink: newShopMapLink.trim(),
            }
            : null,
        status: "pending",
        verificationMethod: "in_person",
        verificationStatus: "pending_visit",
        inPersonVerificationRequired: true,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "users", user.id), {
        shopClaimStatus: "pending_visit",
        updatedAt: serverTimestamp(),
      });

      setNotes("");
      setSelectedShopId("");
      setNewShopName("");
      setNewShopAddress("");
      setNewShopMapLink("");
      toast.success("Shop claim submitted for review.");
    } catch (error) {
      console.error("Failed to submit shop claim:", error);
      toast.error("Could not submit the claim.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0d0d0d] to-[#101010] pt-24 text-white">
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-5 pb-16 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
            <Store size={23} />
          </span>
          <p className="mt-6 text-xs uppercase tracking-[0.18em] text-[var(--color-primary)]">
            Claim a shop
          </p>
          <h1 className="mt-2 text-3xl! font-semibold text-white">
            Request shop verification
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">
            Submit a claim for the shop you own or manage. SATX Ink will verify
            the claim in person at the shop before dashboard access is granted.
          </p>

          {latestClaim && (
            <div className="mt-6 rounded-lg border border-white/10 bg-black/25 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                Latest claim
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">
                    {latestClaim.shopName || latestClaim.shopId}
                  </p>
                  <p className="text-sm text-neutral-400">
                    Status: {formatClaimStatus(latestClaim.status)}
                  </p>
                </div>
                <span className={getClaimBadgeClass(latestClaim.status)}>
                  {formatClaimStatus(latestClaim.status)}
                </span>
              </div>
              {latestClaim.adminNotes && (
                <p className="mt-3 text-sm leading-6 text-neutral-400">
                  Admin note: {latestClaim.adminNotes}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-lg border border-white/10 bg-[#111111] p-6 shadow-2xl">
          <div className="space-y-5">
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                Shop
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setClaimMode("existing")}
                  className={`rounded-md border px-3! py-3! text-left text-sm! font-semibold transition ${
                    claimMode === "existing"
                      ? "border-white/30 bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]"
                  }`}
                >
                  Claim listed shop
                </button>
                <button
                  type="button"
                  onClick={() => setClaimMode("new")}
                  className={`rounded-md border px-3! py-3! text-left text-sm! font-semibold transition ${
                    claimMode === "new"
                      ? "border-white/30 bg-white text-black"
                      : "border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]"
                  }`}
                >
                  Request new shop
                </button>
              </div>
              {claimMode === "existing" ? (
                <select
                  value={selectedShopId}
                  onChange={(event) => setSelectedShopId(event.target.value)}
                  className="mt-3 h-12 w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition focus:border-[var(--color-primary)]"
                >
                  <option value="">Select a shop</option>
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name || shop.id}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-3 grid gap-3">
                  <input
                    value={newShopName}
                    onChange={(event) => setNewShopName(event.target.value)}
                    placeholder="Shop name"
                    className="h-12 rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
                  />
                  <input
                    value={newShopAddress}
                    onChange={(event) => setNewShopAddress(event.target.value)}
                    placeholder="Shop address"
                    className="h-12 rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
                  />
                  <input
                    value={newShopMapLink}
                    onChange={(event) => setNewShopMapLink(event.target.value)}
                    placeholder="Google Maps link"
                    className="h-12 rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
                  />
                </div>
              )}
            </label>

            <div className="rounded-lg border border-white/10 bg-black/25 p-5">
              <CheckCircle2 className="text-[var(--color-primary)]" size={24} />
              <p className="mt-3 text-sm font-semibold text-white">
                In-person verification
              </p>
              <p className="mt-1 text-sm leading-6 text-neutral-400">
                No documents are required here. After you submit, SATX Ink will
                visit the shop, confirm ownership or management authority in
                person, and then unlock the shop dashboard.
              </p>
            </div>

            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                Notes
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Tell us your role at the shop, the best time to visit, and who we should ask for when we arrive."
                className="w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-[var(--color-primary)]"
              />
            </label>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                What happens next
              </p>
              <div className="mt-3 grid gap-3 text-sm text-neutral-300">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
                    1
                  </span>
                  <span>Your claim is added to the SATX Ink admin queue.</span>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
                    2
                  </span>
                  <span>We verify the shop in person at the location.</span>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white">
                    3
                  </span>
                  <span>Admin marks the shop verified and access opens.</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-white px-4! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Building2 size={16} />
              {submitting ? "Submitting..." : "Submit claim"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

const ShopProfilePanel = ({ shop }: { shop: ShopRecord }) => {
  const [name, setName] = useState(shop.name || "");
  const [address, setAddress] = useState(shop.address || "");
  const [mapLink, setMapLink] = useState(shop.mapLink || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(shop.name || "");
    setAddress(shop.address || "");
    setMapLink(shop.mapLink || "");
  }, [shop.address, shop.mapLink, shop.name]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Shop name is required.");
      return;
    }

    try {
      setSaving(true);
      await setDoc(
        doc(db, "shops", shop.id),
        {
          name: name.trim(),
          address: address.trim(),
          mapLink: mapLink.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success("Shop profile updated.");
    } catch (error) {
      console.error("Failed to update shop profile:", error);
      toast.error("Could not update shop profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#111111] p-5 shadow-xl">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
          Shop profile
        </p>
        <h2 className="mt-1 text-xl! font-semibold text-white">
          Public shop details
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-400">
          Keep the name, address, and map link current for artist profiles,
          bookings, and shop events.
        </p>
      </div>
      <div className="mt-5 grid gap-4">
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition focus:border-white/25"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Address
          </span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="h-11 w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition focus:border-white/25"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Map link
          </span>
          <input
            value={mapLink}
            onChange={(event) => setMapLink(event.target.value)}
            className="h-11 w-full rounded-md border border-white/10 bg-[#0b0b0b] px-3 text-sm text-white outline-none transition focus:border-white/25"
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex h-11 w-fit items-center justify-center gap-2 rounded-md bg-white px-4! text-sm! font-semibold text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Pencil size={15} />
          {saving ? "Saving..." : "Save shop profile"}
        </button>
      </div>
    </div>
  );
};

const ArtistsPanel = ({
  artists,
  totalArtists,
  searchTerm,
  onSearchChange,
  shop,
  inviteUrl,
}: {
  artists: ShopArtist[];
  totalArtists: number;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  shop: ShopRecord;
  inviteUrl: string;
}) => {
  const handleCopyInvite = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied.");
  };

  const handleRemoveArtist = async (artist: ShopArtist) => {
    if (!window.confirm(`Remove ${getArtistName(artist)} from ${shop.name || "this shop"}?`)) {
      return;
    }

    try {
      await updateDoc(doc(db, "users", artist.id), {
        shopId: "",
        shopRemovedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success("Artist removed from shop.");
    } catch (error) {
      console.error("Failed to remove artist:", error);
      toast.error("Could not remove artist.");
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-[#111111] shadow-xl">
      <div className="flex flex-col gap-4 border-b border-white/10 p-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
            Artist roster
          </p>
          <h2 className="mt-1 text-xl! font-semibold text-white">
            {totalArtists} affiliated artist{totalArtists === 1 ? "" : "s"}
          </h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row xl:min-w-[520px]">
          <label className="relative w-full sm:flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <input
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search artist, email, or style"
              className="h-10 w-full rounded-md border border-white/10 bg-[#0b0b0b] pl-9 pr-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-white/25"
            />
          </label>
          <button
            type="button"
            onClick={handleCopyInvite}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
          >
            <Copy size={14} />
            Copy invite
          </button>
        </div>
      </div>

      {artists.length === 0 ? (
        <div className="p-10 text-center text-sm text-neutral-500">
          {totalArtists
            ? "No artists match your search."
            : "No artists are affiliated with this shop yet. Use the invite link to bring them in."}
        </div>
      ) : (
        <div className="divide-y divide-white/10">
          {artists.map((artist) => (
            <div
              key={artist.id}
              className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_180px_130px] md:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={artist.avatarUrl || "/default-avatar.png"}
                  alt={getArtistName(artist)}
                  className="h-12 w-12 rounded-full border border-white/10 object-cover"
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">
                    {getArtistName(artist)}
                  </p>
                  <p className="truncate text-sm text-neutral-500">
                    {artist.email || artist.id}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(artist.specialties || []).slice(0, 2).map((specialty) => (
                  <span
                    key={specialty}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-neutral-300"
                  >
                    {specialty}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveArtist(artist)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-300/20 bg-red-300/10 px-3! text-xs! font-semibold text-red-100 transition hover:bg-red-300/15"
              >
                <UserMinus size={14} />
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const InviteCard = ({
  inviteUrl,
  shopName,
}: {
  inviteUrl: string;
  shopName: string;
}) => {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    toast.success("Invite link copied.");
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/5 text-neutral-300">
        <LinkIcon size={18} />
      </span>
      <p className="mt-4 text-sm font-semibold text-white">Artist invite</p>
      <p className="mt-1 text-sm leading-6 text-neutral-400">
        Send this to artists from {shopName}. Signup will preselect your shop.
      </p>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3! text-xs! font-semibold text-white transition hover:bg-white/10"
      >
        <Copy size={14} />
        Copy invite link
      </button>
    </div>
  );
};

const DashboardTab = ({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count?: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-md px-3! py-3! text-sm! font-semibold transition ${
      active
        ? "bg-white/[0.08] text-white"
        : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
    }`}
  >
    {icon}
    <span className="flex-1 text-left">{label}</span>
    {typeof count === "number" && (
      <CountBadge count={count} active={active} />
    )}
  </button>
);

const CountBadge = ({ count, active }: { count: number; active: boolean }) => (
  <span
    className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
      active ? "bg-white/15 text-white" : "bg-white/[0.08] text-neutral-300"
    }`}
  >
    {count}
  </span>
);

const MetricCard = ({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) => (
  <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3">
    <div className="flex min-w-0 items-center gap-1.5 text-neutral-500">
      {icon}
      <p className="truncate text-[10px] uppercase tracking-[0.14em] md:text-xs">
        {label}
      </p>
    </div>
    <p className="mt-2 truncate text-base font-semibold text-white md:text-lg">
      {value}
    </p>
  </div>
);

const getArtistName = (artist: ShopArtist) =>
  artist.displayName || artist.name || artist.id;

const getRecordTime = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof (value as { seconds?: number }).seconds === "number") {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  return 0;
};

const formatClaimStatus = (status: ShopClaim["status"]) =>
  status === "approved" ? "verified" : status.replace("_", " ");

const getClaimBadgeClass = (status: ShopClaim["status"]) => {
  const base =
    "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize";
  if (status === "approved" || status === "verified") {
    return `${base} border-emerald-300/25 bg-emerald-300/10 text-emerald-100`;
  }
  if (status === "rejected") {
    return `${base} border-red-300/25 bg-red-300/10 text-red-100`;
  }
  return `${base} border-amber-300/25 bg-amber-300/10 text-amber-100`;
};

export default ShopDashboardView;
