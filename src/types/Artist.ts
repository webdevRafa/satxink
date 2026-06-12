import { Timestamp, FieldValue } from "firebase/firestore";


export type SocialLinks = {
    instagram?: string;
    facebook?: string;
  };
  
  export type DepositPolicy = {
    depositRequired: true;      // Always true, no amount here
    nonRefundable: boolean;     // Artist’s preference
  };
  
  export type HomepageFeature = {
    story?: string;
    quote?: string;
    imageUrl?: string;
    imageAlt?: string;
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
    depositPolicy: DepositPolicy;
    finalPaymentTiming: "before" | "after";
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
  
