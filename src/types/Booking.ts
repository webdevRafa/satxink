import { Timestamp } from "firebase/firestore";


export type Booking = {
    id: string;
  
    artistId: string;
    artistName: string;
    artistAvatar?: string;
  
    clientId: string;
    offerId: string;
  
    price: number;
    depositAmount: number;
  
    paymentType: "internal" | "external";
    externalPaymentDetails?: {
      method: string;
      handle: string;
    };
  
    finalPaymentTiming: "before" | "after";
  
    shopId?: string;
    shopName?: string;
    shopAddress?: string;
    shopMapLink?: string;
  
    selectedDate: {
      date: string;
      time: string;
    };
  
    sampleImageUrl?: string;
  
    status: "pending_payment" | "paid" | "confirmed" | "cancelled";
    createdAt: Timestamp; // or FirebaseFirestore.Timestamp if you're using strict typing
    paidAt?: Timestamp; 
  };
  