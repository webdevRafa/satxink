import { Fragment, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import Zoom from "react-medium-image-zoom";
import "react-medium-image-zoom/dist/styles.css";
import gun from "../assets/white-gun.svg";
import colorGun from "../assets/gun.svg";

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
  const [isHovered, setIsHovered] = useState(false);

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
      <div className="z-50 sticky top-32 md:top-19 bg-[var(--color-bg-footer)] py-3 px-2 mb-4 flex flex-wrap items-center gap-4 w-full">
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
            className="w-full  bg-[var(--color-bg-base)] shadow-md text-left transition hover:ring-2 ring-neutral-500"
            data-aos="fade-in"
            key={request.id}
            onClick={() => setSelectedRequest(request)}
          >
            <div className="flex items-center mb-1 gap-3 w-full bg-gradient-to-t from-[var(--color-bg-footer)] to-[var(--color-bg-card)]">
              <img
                src={request.clientAvatar}
                alt={request.clientName}
                className="w-10 h-10  translate-[-10%] object-cover"
              />
              <p className="font-medium">{request.clientName}</p>
            </div>

            <img
              src={request.thumbUrl}
              alt="Tattoo idea"
              className="w-full h-32 object-cover mb-2 opacity-80"
            />

            <div className="relative overflow-hidden h-[3.5rem] mb-1 px-2 ">
              <p className="text-sm text-gray-300 line-clamp-2 pr-4">
                {request.description}
              </p>
            </div>

            <div className="px-2">
              {request.preferredDateRange?.length === 2 && (
                <p className="text-xs text-gray-400 mb-1">
                  {formatDateRange(request.preferredDateRange)}
                </p>
              )}
              {request.budget && (
                <p className="text-xs  mb-1">
                  <strong className="text-white">Budget:</strong>{" "}
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
          </div>
        ))}
      </div>

      {/* Modal for request details */}
      <Transition appear show={!!selectedRequest} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-100"
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
                <Dialog.Panel className="w-full max-w-[1000px] transform overflow-hidden rounded-xl bg-gradient-to-b from-[var(--color-bg-card)] to-[var(--color-bg-footer)] p-6 text-white shadow-xl transition-all">
                  {selectedRequest && (
                    <>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold">
                          Booking Request <br></br>
                        </h3>
                        <button
                          onClick={() => setSelectedRequest(null)}
                          className="text-sm text-gray-400 hover:text-white!"
                        >
                          Close
                        </button>
                      </div>
                      <div className="flex flex-col md:flex-row py-5 gap-5">
                        <div className="w-full h-full flex items-center justify-center">
                          <div>
                            <Zoom>
                              <img
                                src={selectedRequest.fullUrl}
                                alt="Tattoo idea"
                                className="w-full max-h-[65vh] md:max-h-[50vh] object-contain rounded-md mb-4 shadow-lg"
                              />
                            </Zoom>
                          </div>
                        </div>
                        {/* right section container for modal */}
                        <div className="w-full flex justify-start md:justify-center items-end pb-0 md:pb-10">
                          <div>
                            <div className="flex gap-2 items-start mb-5">
                              <img
                                className="size-7 rounded-xl"
                                src={selectedRequest.clientAvatar}
                                alt=""
                              />
                              <p className="text-sm mb-2">
                                {selectedRequest.clientName}
                              </p>
                            </div>
                            <p className="text-sm mb-2">
                              <strong className="text-neutral-200">
                                Body Placement:
                              </strong>{" "}
                              {selectedRequest.bodyPlacement}
                            </p>
                            <p className="text-sm mb-2">
                              <strong className="text-neutral-200">
                                Size:
                              </strong>{" "}
                              {selectedRequest.size}
                            </p>
                            {selectedRequest.budget && (
                              <p className="text-sm  font-medium mb-2">
                                <strong className="text-neutral-200">
                                  Budget:
                                </strong>{" "}
                                {typeof selectedRequest.budget === "number"
                                  ? `$${selectedRequest.budget}`
                                  : (() => {
                                      const [min, max] =
                                        selectedRequest.budget.split("-");
                                      return `$${min}–$${max}`;
                                    })()}
                              </p>
                            )}
                            {selectedRequest.preferredDateRange?.length ===
                              2 && (
                              <p className="text-sm mb-2">
                                <strong className="text-neutral-200">
                                  Available Date Range:
                                </strong>{" "}
                                {formatDateRange(
                                  selectedRequest.preferredDateRange
                                )}
                              </p>
                            )}
                            {selectedRequest.availableTime?.from &&
                              selectedRequest.availableTime?.to && (
                                <p className="text-sm mb-2">
                                  <strong className="text-neutral-200">
                                    Preferred Time:
                                  </strong>{" "}
                                  {formatTime(
                                    selectedRequest.availableTime.from
                                  )}{" "}
                                  –{" "}
                                  {formatTime(selectedRequest.availableTime.to)}
                                </p>
                              )}
                            {selectedRequest.availableDays?.length > 0 && (
                              <p className="text-sm mb-2">
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

                            <div className="flex  gap-2 md:gap-3 md:mt-10">
                              <button className="bg-[#121212] hover:bg-[var(--color-bg-footer)] border-2 border-neutral-500 hover:border-red-400  text-red-400! w-full text-sm p-0! rounded max-w-[200px] py-2!">
                                Decline
                              </button>
                              <button
                                onMouseEnter={() => setIsHovered(true)}
                                onMouseLeave={() => setIsHovered(false)}
                                onClick={() => {
                                  onMakeOffer(selectedRequest);
                                  setSelectedRequest(null);
                                }}
                                className="bg-[#121212] border-2 border-neutral-500 hover:border-emerald-400 text-emerald-400! w-full text-sm p-0! rounded flex gap-1 justify-center items-center max-w-[200px]"
                              >
                                Make an offer
                                <img
                                  className="h-8 w-10 p-0!"
                                  src={isHovered ? colorGun : gun}
                                  alt=""
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
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
