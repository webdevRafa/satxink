import { Timestamp, FieldValue } from "firebase/firestore";
import type {
  ExternalPaymentMethod,
  FinalPaymentDeadlineHours,
} from "./PaymentPreferences";
import type { BookingAvailability } from "../utils/bookingAvailability";


export type SocialLinks = {
    instagram?: string;
    facebook?: string;
  };
  
  export type DepositPolicy = {
    depositRequired: true;      // Always true, no amount here
    nonRefundable: boolean;     // Artist’s preference
  };
  
  export type HomepageFeatureImage = {
    id: string;
    imageUrl: string;
    thumbUrl?: string | null;
    webp90Url?: string | null;
    fullUrl?: string | null;
    imageAlt?: string;
    thumbPath?: string | null;
    previewPath?: string | null;
    fullPath?: string | null;
    fileName?: string | null;
    order?: number;
  };

  export type HomepageFeature = {
    story?: string;
    quote?: string;
    imageUrl?: string;
    imageAlt?: string;
    images?: HomepageFeatureImage[];
    updatedAt?: Date | Timestamp | FieldValue | null;
  };

  export type Artist = {
    id: string;                 
    avatarUrl: string;
    name?: string;
    displayName?: string;
    bio: string;
    email: string;
    phoneNumber?: string;
    role: "artist";
    shopId?: string;            
    specialties: string[];      
    featured: boolean;
    homepageFeature?: HomepageFeature;
    isVerified?: boolean | "true" | "false";
    profileComplete: boolean;
    paymentType: "internal" | "external";
    externalPaymentMethods?: ExternalPaymentMethod[];
    externalPaymentDetails?: {
      method: string;
      handle: string;
    } | null;
    depositPolicy: DepositPolicy;
    finalPaymentTiming: "before" | "after";
    finalPaymentDeadlineHours?: FinalPaymentDeadlineHours | null;
    bookingAvailability?: BookingAvailability;
    stripeConnect?: {
      accountId?: string;
      chargesEnabled?: boolean;
      payoutsEnabled?: boolean;
      detailsSubmitted?: boolean;
      onboardingComplete?: boolean;
      disabledReason?: string | null;
      lastSyncedAt?: Date | Timestamp | FieldValue | null;
    };
    socialLinks: SocialLinks;
  
    upvotes?: number;           
    rating?: number;            
    likedBy?: string[];         
    createdAt?: Date | Timestamp | FieldValue | null;
  updatedAt?: Date | Timestamp | FieldValue | null;
  };
  
