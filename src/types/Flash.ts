export type Flash = {
    id: string;                  
    artistId: string;            
    imageUrl: string;            
    title?: string;              
    isAvailable?: boolean;       
    price?: number;             
    tags?: string[];             
    createdAt: Date;
  };
  