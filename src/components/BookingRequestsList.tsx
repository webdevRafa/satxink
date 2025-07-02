import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";

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
  bookingRequests: BookingRequest[];
  onMakeOffer: (request: BookingRequest) => void;
}

const BookingRequestsList: React.FC<Props> = ({
  bookingRequests,
  onMakeOffer,
}) => {
  const [selectedRequest, setSelectedRequest] = useState<BookingRequest | null>(
    null
  );

  return (
    <>
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {bookingRequests.map((request) => (
          <button
            key={request.id}
            onClick={() => setSelectedRequest(request)}
            className="w-full  bg-[var(--color-bg-card)] rounded-xl shadow-md p-4 text-left transition hover:ring-2 ring-neutral-500"
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

      {/* Modal for request details */}
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
                        <h3 className="text-lg font-semibold">
                          Booking Request
                        </h3>
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
                        <strong>Client:</strong> {selectedRequest.clientName}
                      </p>
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
                      {selectedRequest.preferredDateRange?.length ? (
                        <p className="text-xs text-gray-400 mb-4">
                          <strong>Preferred Dates:</strong>{" "}
                          {selectedRequest.preferredDateRange.join(", ")}
                        </p>
                      ) : null}

                      <button
                        onClick={() => {
                          onMakeOffer(selectedRequest);
                          setSelectedRequest(null);
                        }}
                        className="bg-[#121212] border-2 border-neutral-500 text-white! w-full text-sm px-4 py-2 rounded"
                      >
                        Make an offer
                      </button>
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

export default BookingRequestsList;
