import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";

type BookingRequest = {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar: string;
  description: string;
  preferredDateRange?: string[];
  availableDays: string[];
  availableTime?: {
    from: string;
    to: string;
  };
  bodyPlacement: string;
  size: "small" | "medium" | "large" | "Small" | "Medium" | "Large";
  fullUrl: string;
  thumbUrl: string;
  budget?: string | number; // ✅ support both dropdown ranges and custom exact value
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
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth()
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [isFiltering, setIsFiltering] = useState(false);

  const formatDateRange = (dates: string[]): string => {
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    const [start, end] = dates;

    const toLocalDate = (dateStr: string): string => {
      const [year, month, day] = dateStr.split("-").map(Number);
      const localDate = new Date(year, month - 1, day); // no UTC conversion
      return localDate.toLocaleDateString("en-US", options);
    };

    return `${toLocalDate(start)} - ${toLocalDate(end)}`;
  };
  const formatTime = (time: string): string => {
    const [hourStr, minute] = time.split(":");
    let hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? "pm" : "am";
    hour = hour % 12 || 12; // Convert 0 to 12
    return `${hour}:${minute}${ampm}`;
  };
  const getFormattedAvailableDays = (days: string[]): string => {
    const dayOrder = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const abbreviations: { [key: string]: string } = {
      Sunday: "Sun",
      Monday: "Mon",
      Tuesday: "Tue",
      Wednesday: "Wed",
      Thursday: "Thu",
      Friday: "Fri",
      Saturday: "Sat",
    };

    const sorted = [...days].sort(
      (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)
    );

    return sorted.map((day) => abbreviations[day] || day).join(", ");
  };

  const filteredRequests = isFiltering
    ? bookingRequests.filter((req) => {
        if (!req.preferredDateRange) return false;
        const [startStr, endStr] = req.preferredDateRange;
        const reqStart = new Date(startStr);
        const reqEnd = new Date(endStr);

        const requestMonths = [reqStart.getMonth(), reqEnd.getMonth()];
        const requestYears = [reqStart.getFullYear(), reqEnd.getFullYear()];

        return (
          requestYears.includes(selectedYear) &&
          requestMonths.includes(selectedMonth)
        );
      })
    : bookingRequests;

  return (
    <>
      <div className="bg-[var(--color-bg-base)] py-3 px-2 mb-4 flex flex-wrap items-center gap-4 max-w-[900px]">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
          className="bg-[var(--color-bg-base)] text-white border border-neutral-700 rounded px-3 py-1 text-sm"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>
              {new Date(0, i).toLocaleString("en-US", { month: "long" })}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="bg-[var(--color-bg-base)] text-white border border-neutral-700 rounded px-3 py-1 text-sm"
        >
          {[2025, 2026, 2027].map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <button
          onClick={() => setIsFiltering(true)}
          className="bg-[var(--color-bg-card)] hover:bg-neutral-400 text-white px-3 py-1 rounded text-sm"
        >
          Filter
        </button>

        {isFiltering && (
          <button
            onClick={() => setIsFiltering(false)}
            className="text-sm underline text-red-400 hover:text-red-300"
          >
            Clear Filter
          </button>
        )}
      </div>

      <div className="max-w-[1800px] grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {filteredRequests.map((request) => (
          <div
            className="w-full  bg-[var(--color-bg-card)] rounded-xl shadow-md p-4 text-left transition hover:ring-2 ring-neutral-500"
            data-aos="fade-in"
            key={request.id}
            onClick={() => setSelectedRequest(request)}
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

            <div className="relative overflow-hidden h-[3.5rem] mb-1">
              <p className="text-sm text-gray-300 line-clamp-2 pr-4">
                {request.description}
              </p>
              <div className="absolute bottom-0 right-0 h-full w-10 bg-gradient-to-l from-[var(--color-bg-card)] to-transparent pointer-events-none" />
            </div>

            {request.preferredDateRange?.length === 2 && (
              <p className="text-xs text-gray-400 mb-1">
                {formatDateRange(request.preferredDateRange)}
              </p>
            )}
            {request.budget && (
              <p className="text-xs text-emerald-400! mb-1">
                <strong>Budget:</strong>{" "}
                {typeof request.budget === "number"
                  ? `$${request.budget}`
                  : (() => {
                      const [min, max] = request.budget.split("-");
                      return `$${min}–$${max}`;
                    })()}
              </p>
            )}

            <p className="text-xs text-gray-400">Tap to view details</p>
          </div>
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

                      <Zoom>
                        <img
                          src={selectedRequest.fullUrl}
                          alt="Tattoo idea"
                          className="w-full max-h-[65vh] object-contain rounded-md mb-4"
                        />
                      </Zoom>

                      <p className="text-sm mb-1">
                        <strong className="text-neutral-200">Client:</strong>{" "}
                        {selectedRequest.clientName}
                      </p>
                      <p className="text-sm mb-1">
                        <strong className="text-neutral-200">
                          Body Placement:
                        </strong>{" "}
                        {selectedRequest.bodyPlacement}
                      </p>
                      <p className="text-sm mb-1">
                        <strong className="text-neutral-200">Size:</strong>{" "}
                        {selectedRequest.size}
                      </p>
                      {selectedRequest.budget && (
                        <p className="text-sm text-emerald-400! font-medium mb-1">
                          <strong className="text-neutral-200">Budget:</strong>{" "}
                          {typeof selectedRequest.budget === "number"
                            ? `$${selectedRequest.budget}`
                            : (() => {
                                const [min, max] =
                                  selectedRequest.budget.split("-");
                                return `$${min}–$${max}`;
                              })()}
                        </p>
                      )}
                      {selectedRequest.preferredDateRange?.length === 2 && (
                        <p className="text-sm mb-1">
                          <strong className="text-neutral-200">
                            Available Date Range:
                          </strong>{" "}
                          {formatDateRange(selectedRequest.preferredDateRange)}
                        </p>
                      )}
                      {selectedRequest.availableTime?.from &&
                        selectedRequest.availableTime?.to && (
                          <p className="text-sm mb-1">
                            <strong className="text-neutral-200">
                              Preferred Time:
                            </strong>{" "}
                            {formatTime(selectedRequest.availableTime.from)} –{" "}
                            {formatTime(selectedRequest.availableTime.to)}
                          </p>
                        )}
                      {selectedRequest.availableDays?.length > 0 && (
                        <p className="text-sm mb-1">
                          <strong className="text-neutral-200">
                            Available Days:
                          </strong>{" "}
                          {getFormattedAvailableDays(
                            selectedRequest.availableDays
                          )}
                        </p>
                      )}

                      <p className="text-sm mb-3">
                        <strong className="text-neutral-200">
                          Description:
                        </strong>{" "}
                        {selectedRequest.description}
                      </p>
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
