import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Tag,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import FlashRequestModal, {
  type FlashRequestArtist,
  type FlashRequestClient,
} from "../components/FlashRequestModal";
import type { Flash } from "../types/Flash";
import type { FlashSheet } from "../types/FlashSheet";
import {
  isFlashAvailableForClients,
} from "../utils/flashAvailability";
import {
  FlashPreviewImage,
  FlashPreviewMeta,
} from "../components/FlashPreviewCard";
import {
  flashPreviewCardClassName,
  getFlashTitle,
} from "../utils/flashPreview";
import { getClientNameParts } from "../utils/clientDisplayName";

type PublicArtist = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string;
  studioName?: string;
};

const FLASH_ITEMS_PER_PAGE = 18;

const PublicFlashSheetPage = () => {
  const { sheetId } = useParams<{ sheetId: string }>();
  const [sheet, setSheet] = useState<FlashSheet | null>(null);
  const [artist, setArtist] = useState<PublicArtist | null>(null);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState<FlashRequestClient | null>(null);
  const [selectedFlash, setSelectedFlash] = useState<Flash | null>(null);
  const [flashPage, setFlashPage] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setClient(null);
        return;
      }

      try {
        const clientRef = doc(db, "users", user.uid);
        const clientSnap = await getDoc(clientRef);
        const data = clientSnap.exists() ? clientSnap.data() : {};
        const clientNameParts = getClientNameParts(data, user.displayName || "Client");

        setClient({
          id: user.uid,
          name: clientNameParts.fullName,
          firstName: clientNameParts.firstName,
          lastName: clientNameParts.lastName,
          avatarUrl:
            (data.avatarUrl as string) ||
            user.photoURL ||
            "/default-avatar.png",
        });
      } catch (err) {
        console.error("Failed to fetch client profile:", err);
        const clientNameParts = getClientNameParts(
          { displayName: user.displayName },
          "Client"
        );
        setClient({
          id: user.uid,
          name: clientNameParts.fullName,
          firstName: clientNameParts.firstName,
          lastName: clientNameParts.lastName,
          avatarUrl: user.photoURL || "/default-avatar.png",
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchSheet = async () => {
      if (!sheetId) return;

      try {
        setLoading(true);

        const sheetSnap = await getDoc(doc(db, "flashSheets", sheetId));
        if (!sheetSnap.exists()) {
          if (isMounted) {
            setSheet(null);
            setFlashes([]);
          }
          return;
        }

        const sheetData = {
          id: sheetSnap.id,
          ...sheetSnap.data(),
        } as FlashSheet;

        const flashesQuery = query(
          collection(db, "flashes"),
          where("sheetId", "==", sheetId),
          where("marketplaceReady", "==", true)
        );

        const [flashesSnap, artistSnap] = await Promise.all([
          getDocs(flashesQuery),
          getDoc(doc(db, "users", sheetData.artistId)),
        ]);

        if (!isMounted) return;

        setSheet(sheetData);
        setFlashes(
          flashesSnap.docs
            .map((flashDoc) => ({
              id: flashDoc.id,
              ...flashDoc.data(),
            }))
            .filter((flash): flash is Flash => {
              const typedFlash = flash as Flash;
              return isFlashAvailableForClients(typedFlash);
            })
            .sort(sortByNewest)
        );

        setArtist(
          artistSnap.exists()
            ? ({ id: artistSnap.id, ...artistSnap.data() } as PublicArtist)
            : null
        );
      } catch (err) {
        console.error("Failed to fetch public flash sheet:", err);
        if (isMounted) {
          setSheet(null);
          setFlashes([]);
          setArtist(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchSheet();

    return () => {
      isMounted = false;
    };
  }, [sheetId]);

  const artistName = getArtistName(artist);
  const tags = useMemo(() => sheet?.tags || [], [sheet]);
  const flashPageCount = Math.max(
    1,
    Math.ceil(flashes.length / FLASH_ITEMS_PER_PAGE)
  );
  const pagedFlashes = flashes.slice(
    flashPage * FLASH_ITEMS_PER_PAGE,
    flashPage * FLASH_ITEMS_PER_PAGE + FLASH_ITEMS_PER_PAGE
  );

  useEffect(() => {
    setFlashPage(0);
  }, [sheetId]);

  useEffect(() => {
    if (flashPage >= flashPageCount) {
      setFlashPage(Math.max(0, flashPageCount - 1));
    }
  }, [flashPage, flashPageCount]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0c0c0c] to-[#151515] px-4 pb-20 pt-24 text-white">
        <section className="mx-auto max-w-6xl">
          <div className="h-[360px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]" />
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-[360px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.035]"
              />
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (!sheet) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0c0c0c] to-[#151515] px-4 pb-20 pt-24 text-white">
        <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center">
          <ImageOff className="mx-auto mb-4 text-white/25" size={42} />
          <h1 className="text-2xl! font-semibold text-white">
            Flash sheet unavailable
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/50">
            This sheet may have been removed or is no longer available.
          </p>
          <Link
            to="/flash"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85"
          >
            <ArrowLeft size={16} />
            Back to flash
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#101010] via-[#0c0c0c] to-[#151515] px-4 pb-20 pt-24 text-white">
      <section className="mx-auto max-w-6xl">
        <Link
          to="/flash"
          className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 transition hover:text-white"
        >
          <ArrowLeft size={16} />
          Back to flash marketplace
        </Link>

        <div className="mt-5 grid gap-6 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] p-5 shadow-xl lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <img
              src={sheet.thumbUrl || sheet.imageUrl}
              alt={sheet.title || "Flash sheet"}
              className="h-full max-h-[520px] w-full object-cover"
            />
          </div>

          <div className="flex min-w-0 flex-col justify-end">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">
              Flash sheet
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl! font-bold leading-tight text-white md:text-4xl!">
              {sheet.title || "Untitled flash sheet"}
            </h1>
            <p className="mt-3 text-sm text-white/55">by {artistName}</p>

            {tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-white/55"
                  >
                    <Tag size={12} />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <p className="rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/55">
                {flashes.length} itemized flash
                {flashes.length === 1 ? "" : "es"}
              </p>
              <Link
                to={`/artists/${sheet.artistId}`}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-primary-hover)]"
              >
                View artist
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
              Sheet items
            </p>
            <h2 className="mt-2 text-3xl! font-semibold text-white">
              Itemized flash
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-white/45">
              {flashes.length} result{flashes.length === 1 ? "" : "s"}
            </p>
            {flashes.length > FLASH_ITEMS_PER_PAGE && (
              <FlashPager
                currentPage={flashPage}
                pageCount={flashPageCount}
                totalItems={flashes.length}
                pageSize={FLASH_ITEMS_PER_PAGE}
                onPrevious={() =>
                  setFlashPage((page) => Math.max(0, page - 1))
                }
                onNext={() =>
                  setFlashPage((page) =>
                    Math.min(flashPageCount - 1, page + 1)
                  )
                }
              />
            )}
          </div>
        </div>

        {flashes.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {pagedFlashes.map((flash) => (
              <PublicFlashCard
                key={flash.id}
                artistId={sheet.artistId}
                artist={artist}
                flash={flash}
                onRequest={() => setSelectedFlash(flash)}
              />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] p-10 text-center">
            <ImageOff className="mx-auto mb-4 text-white/25" size={38} />
            <h3 className="text-2xl! font-semibold text-white">
              No itemized flash yet
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/50">
              This sheet is available to view, but the artist has not published
              itemized flash from it yet.
            </p>
          </div>
        )}
      </section>

      {selectedFlash && (
        <FlashRequestModal
          artist={getRequestArtist(sheet, artist)}
          client={client}
          flash={selectedFlash}
          onClose={() => setSelectedFlash(null)}
        />
      )}
    </main>
  );
};

const FlashPager = ({
  currentPage,
  pageCount,
  totalItems,
  pageSize,
  onPrevious,
  onNext,
}: {
  currentPage: number;
  pageCount: number;
  totalItems: number;
  pageSize: number;
  onPrevious: () => void;
  onNext: () => void;
}) => {
  const firstItem = currentPage * pageSize + 1;
  const lastItem = Math.min(totalItems, (currentPage + 1) * pageSize);

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-2 py-1">
      <span className="px-2 text-xs font-semibold text-white/45">
        {firstItem}-{lastItem} of {totalItems}
      </span>
      <button
        type="button"
        onClick={onPrevious}
        disabled={currentPage === 0}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white p-0! text-black shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/25"
        aria-label="Previous flash page"
      >
        <ChevronLeft size={16} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={currentPage >= pageCount - 1}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white p-0! text-black shadow-sm transition hover:bg-white/85 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/25"
        aria-label="Next flash page"
      >
        <ChevronRight size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
};

const PublicFlashCard = ({
  artistId,
  artist,
  flash,
  onRequest,
}: {
  artistId: string;
  artist?: PublicArtist | null;
  flash: Flash;
  onRequest: () => void;
}) => {
  return (
    <article
      tabIndex={0}
      className={`${flashPreviewCardClassName} focus:outline-none focus:ring-2 focus:ring-white/20`}
    >
      <FlashPreviewImage flash={flash} />

      <div className="p-3">
        <FlashPreviewMeta flash={flash} artist={artist} />
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
          <Link
            to={`/artists/${artistId}`}
            className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.035] px-2 text-[11px] font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            View artist
          </Link>
          <button
            type="button"
            onClick={onRequest}
            className="pointer-events-none !inline-flex !h-8 !items-center !justify-center !whitespace-nowrap !rounded-md bg-[var(--color-primary)] !px-2 !py-0 !text-[11px] font-semibold text-white opacity-0 transition hover:bg-[var(--color-primary-hover)] group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 [@media(pointer:coarse)]:pointer-events-auto [@media(pointer:coarse)]:opacity-100"
            aria-label={`Request this flash: ${getFlashTitle(flash)}`}
          >
            Request
          </button>
        </div>
      </div>
    </article>
  );
};

const getArtistName = (artist?: PublicArtist | null) =>
  artist?.displayName || artist?.name || "SATX Ink artist";

const getRequestArtist = (
  sheet: FlashSheet,
  artist?: PublicArtist | null
): FlashRequestArtist => ({
  id: artist?.id || sheet.artistId,
  name: artist?.name,
  displayName: artist?.displayName,
  avatarUrl: artist?.avatarUrl,
});

const getCreatedTime = (flash: Flash) => {
  const createdAt = flash.createdAt;

  if (!createdAt) return 0;
  if (createdAt instanceof Date) return createdAt.getTime();

  const maybeTimestamp = createdAt as {
    seconds?: number;
    toDate?: () => Date;
  };

  if (typeof maybeTimestamp.toDate === "function") {
    return maybeTimestamp.toDate().getTime();
  }

  if (typeof maybeTimestamp.seconds === "number") {
    return maybeTimestamp.seconds * 1000;
  }

  return 0;
};

const sortByNewest = (a: Flash, b: Flash) =>
  getCreatedTime(b) - getCreatedTime(a);

export default PublicFlashSheetPage;
