import { useEffect, useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";

type BookingRequest = {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  description: string;
  preferredDateRange?: string[];
  bodyPlacement: string;
  size: "small" | "medium" | "large" | "Small" | "Medium" | "Large";
  fullUrl: string;
  thumbUrl: string;
};

interface Props {
  clientId: string;
}

const ClientRequestsList: React.FC<Props> = ({ clientId }) => {
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(
    null
  );

  useEffect(() => {
    const fetchRequests = async () => {
      const q = query(
        collection(db, "bookingRequests"),
        where("clientId", "==", clientId)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as BookingRequest[];
      setRequests(data);
    };

    if (clientId) fetchRequests();
  }, [clientId]);

  const formatDateRange = (dates: string[]): string => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const [start, end] = dates;
    const startDate = new Date(start).toLocaleDateString("en-US", options);
    const endDate = new Date(end).toLocaleDateString("en-US", options);
    return `${startDate} - ${endDate}`;
  };

  return (
    <>
      <h2 className="text-xl font-semibold mb-4">My Tattoo Requests</h2>
      {requests.length === 0 ? (
        <p className="text-sm text-gray-400">
          You haven’t submitted any requests yet.
        </p>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {requests.map((request) => (
            <button
              key={request.id}
              onClick={() => setSelectedRequest(request)}
              className="w-full bg-[var(--color-bg-card)] rounded-xl shadow-md p-4 text-left transition hover:ring-2 ring-neutral-500"
            >
              <div className="flex items-center gap-3 mb-3">
                <img
                  src={request.clientAvatar}
                  alt={request.clientName}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <p className="font-medium">{request.clientName}</p>
              </div>

              <img
                src={request.thumbUrl}
                alt="Tattoo idea"
                className="w-full h-32 object-cover rounded-md mb-2"
              />

              <p className="text-sm text-gray-300 line-clamp-2 mb-1">
                {request.description}
              </p>

              <p className="text-xs text-gray-400">Tap to view details</p>
            </button>
          ))}
        </div>
      )}

      <Transition appear show={!!selectedRequest} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setSelectedRequest(null)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="scale-95 opacity-0"
                enterTo="scale-100 opacity-100"
                leave="ease-in duration-150"
                leaveFrom="scale-100 opacity-100"
                leaveTo="scale-95 opacity-0"
              >
                <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-xl bg-[var(--color-bg-base)] p-6 text-white shadow-xl transition-all">
                  {selectedRequest && (
                    <>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold">My Request</h3>
                        <button
                          onClick={() => setSelectedRequest(null)}
                          className="text-sm text-gray-400 hover:text-gray-200"
                        >
                          Close
                        </button>
                      </div>

                      <img
                        src={selectedRequest.fullUrl}
                        alt="Tattoo idea"
                        className="w-full h-48 object-cover rounded-md mb-4"
                      />

                      <p className="text-sm mb-1">
                        <strong>Body Placement:</strong>{" "}
                        {selectedRequest.bodyPlacement}
                      </p>
                      <p className="text-sm mb-1">
                        <strong>Size:</strong> {selectedRequest.size}
                      </p>
                      <p className="text-sm mb-3">
                        <strong>Description:</strong>{" "}
                        {selectedRequest.description}
                      </p>
                      {selectedRequest.preferredDateRange?.length === 2 && (
                        <p className="text-sm mb-3">
                          <strong>Available Date Range:</strong>{" "}
                          {formatDateRange(selectedRequest.preferredDateRange)}
                        </p>
                      )}
                    </>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
};

export default ClientRequestsList;
