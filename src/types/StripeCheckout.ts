export interface CheckoutRequestData {
    offerId: string;
    clientId: string;
    artistId: string;
    price: number;
    displayName: string;
    artistAvatar?: string;
    shopName?: string;
    shopAddress?: string;
    fullUrl?: string;
    selectedDate: {
      date: string;
      time: string;
    };
  }
  