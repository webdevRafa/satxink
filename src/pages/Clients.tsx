import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type Client = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: string;
};

const Clients = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const q = query(collection(db, "users"), where("role", "==", "client"));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Client[];

        setClients(data);
      } catch (error) {
        console.error("Error fetching clients:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

  if (loading)
    return <div className="text-center mt-10">Loading clients...</div>;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Clients</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6 max-w-[1400px] mx-auto">
        {clients.map((client) => (
          <div
            data-aos="fade-up"
            key={client.id}
            className="bg-[#1c1c1c] text-white rounded-xl overflow-hidden shadow-md"
          >
            <img
              src={client.avatarUrl}
              alt={client.name}
              className="w-full h-52 object-cover"
            />
            <div>
              <h2 className="text-lg font-semibold">{client.name}</h2>
              <p className="text-sm text-gray-500">{client.email}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Clients;
