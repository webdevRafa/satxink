import { Timestamp, FieldValue } from "firebase/firestore";


export type SocialLinks = {
    instagram?: string;
    facebook?: string;
    website?: string;
  };
  
  export type DepositPolicy = {
    depositRequired: true;      // Always true, no amount here
    nonRefundable: boolean;     // Artist’s preference
  };
  
  export type Artist = {
    id: string;                 
    avatarUrl: string;
    name?: string;
    displayName: string;
    bio: string;
    email: string;
    phoneNumber?: string;
    role: "artist";
    shopId?: string;            
    specialties: string[];      
    featured: boolean;
    isVerified: boolean;
    profileComplete: boolean;
    paymentType: "internal" | "external";
    depositPolicy: DepositPolicy;
    finalPaymentTiming: "before" | "after";
    socialLinks: SocialLinks;
  
    upvotes?: number;           
    rating?: number;            
    likedBy?: string[];         
    createdAt?: Date | Timestamp | FieldValue | null;
  updatedAt?: Date | Timestamp | FieldValue | null;
  };
  