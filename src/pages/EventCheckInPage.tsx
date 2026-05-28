import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, Ticket, XCircle } from "lucide-react";
import { auth, functions } from "../firebase/firebaseConfig";

type CheckInState = "checking" | "success" | "already" | "login" | "error";

const EventCheckInPage = () => {
  const { registrationId = "", qrToken = "" } = useParams();
  const [state, setState] = useState<CheckInState>("checking");
  const [message, setMessage] = useState("Verifying this event pass.");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState("login");
        setMessage("Sign in as the event host or shop owner to check in this pass.");
        return;
      }

      if (!registrationId || !qrToken) {
        setState("error");
        setMessage("This event pass link is incomplete.");
        return;
      }

      try {
        const checkIn = httpsCallable<
          { registrationId: string; qrToken: string },
          { status: string; alreadyCheckedIn?: boolean }
        >(functions, "checkInEventRegistration");
        const result = await checkIn({ registrationId, qrToken });
        setState(result.data.alreadyCheckedIn ? "already" : "success");
        setMessage(
          result.data.alreadyCheckedIn
            ? "This attendee was already checked in."
            : "Attendee checked in successfully."
        );
      } catch (error) {
        setState("error");
        setMessage(getCheckInErrorMessage(error));
      }
    });

    return () => unsubscribe();
  }, [registrationId, qrToken]);

  const isPositive = state === "success" || state === "already";

  return (
    <main className="min-h-screen bg-[#101010] px-4 pt-28 text-white">
      <section className="mx-auto max-w-md rounded-xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl">
        <div
          className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
            state === "checking"
              ? "bg-white/10 text-white"
              : isPositive
              ? "bg-emerald-400/10 text-emerald-200"
              : "bg-red-400/10 text-red-200"
          }`}
        >
          {state === "checking" ? (
            <Loader2 className="animate-spin" size={28} />
          ) : isPositive ? (
            <CheckCircle2 size={30} />
          ) : state === "login" ? (
            <Ticket size={30} />
          ) : (
            <XCircle size={30} />
          )}
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
          Event check-in
        </p>
        <h1 className="mt-2 text-2xl! font-semibold text-white">
          {state === "checking"
            ? "Checking pass"
            : isPositive
            ? "Pass accepted"
            : state === "login"
            ? "Host sign-in needed"
            : "Could not check in"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/55">{message}</p>
        <div className="mt-6 flex justify-center gap-3">
          {state === "login" && (
            <Link
              to="/login-page"
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/85"
            >
              Sign in
            </Link>
          )}
          <Link
            to="/dashboard"
            className="rounded-md border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/75 transition hover:border-white/25 hover:text-white"
          >
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
};

const getCheckInErrorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "This pass could not be verified.";
};

export default EventCheckInPage;
