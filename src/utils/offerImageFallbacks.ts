import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type OfferImageCandidate = {
  fullUrl?: string | null;
  thumbUrl?: string | null;
  imageFilename?: string | null;
  previousOfferId?: string | null;
};

type OfferImageFallback = {
  fullUrl?: string | null;
  thumbUrl?: string | null;
  imageFilename?: string | null;
};

const hasOfferImage = (offer: OfferImageCandidate) =>
  Boolean(offer.fullUrl || offer.thumbUrl);

export const applyOfferImageFallbacks = async <
  T extends OfferImageCandidate
>(
  offers: T[]
): Promise<T[]> => {
  const fallbackIds = Array.from(
    new Set(
      offers
        .filter((offer) => !hasOfferImage(offer) && offer.previousOfferId)
        .map((offer) => offer.previousOfferId as string)
    )
  );

  if (!fallbackIds.length) return offers;

  const fallbackEntries = await Promise.all(
    fallbackIds.map(async (offerId) => {
      try {
        const previousOfferSnap = await getDoc(doc(db, "offers", offerId));
        if (!previousOfferSnap.exists()) return [offerId, null] as const;

        const previousOffer = previousOfferSnap.data() as OfferImageCandidate;
        if (!hasOfferImage(previousOffer)) return [offerId, null] as const;

        return [
          offerId,
          {
            fullUrl: previousOffer.fullUrl || null,
            thumbUrl: previousOffer.thumbUrl || null,
            imageFilename: previousOffer.imageFilename || null,
          },
        ] as const;
      } catch (error) {
        console.error("Failed to load previous offer image:", error);
        return [offerId, null] as const;
      }
    })
  );

  const fallbackByOfferId = new Map<string, OfferImageFallback | null>(
    fallbackEntries
  );

  return offers.map((offer) => {
    if (hasOfferImage(offer) || !offer.previousOfferId) return offer;

    const fallback = fallbackByOfferId.get(offer.previousOfferId);
    if (!fallback) return offer;

    return {
      ...offer,
      fullUrl: fallback.fullUrl || offer.fullUrl || null,
      thumbUrl: fallback.thumbUrl || offer.thumbUrl || null,
      imageFilename: fallback.imageFilename || offer.imageFilename || null,
    } as T;
  });
};
