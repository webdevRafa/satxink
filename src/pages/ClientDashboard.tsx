// src/pages/ClientDashboard.tsx
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import Spinner from "../components/ui/Spinner";

type Client = {
  name: string;
  email: string;
  avatarUrl: string;
  likedArtists: string[];
  preferredStyles: string[];
};

const ClientDashboard = () => {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        const clientRef = doc(db, "users", "VRUNIfCcE9n0ix3JY1GA");
        const clientSnap = await getDoc(clientRef);

        if (clientSnap.exists()) {
          setClient(clientSnap.data() as Client);
        } else {
          console.error("Client not found.");
        }
      } catch (error) {
        console.error("Error fetching client:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchClient();
  }, []);

  if (loading)
    return (
      <div className="flex justify-center mt-10">
        <Spinner />
      </div>
    );

  if (!client)
    return (
      <div className="text-center mt-10 text-red-500">Client not found.</div>
    );

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Welcome, {client.name}</h1>

      <div className="flex items-start gap-6">
        <img
          src={client.avatarUrl}
          alt={client.name}
          className="w-32 h-32 object-cover rounded-full"
        />
        <div>
          <p className="text-gray-600">{client.email}</p>

          <div className="mt-4">
            <h2 className="font-bold">Preferred Styles:</h2>
            <ul className="list-disc list-inside text-sm">
              {client.preferredStyles.map((style, index) => (
                <li key={index}>{style}</li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <h2 className="font-bold">Liked Artists:</h2>
            <ul className="list-disc list-inside text-sm">
              {client.likedArtists.length > 0 ? (
                client.likedArtists.map((id, index) => (
                  <li key={index}>Artist ID: {id}</li>
                ))
              ) : (
                <li>No liked artists yet.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;
