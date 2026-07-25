import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import toast from "react-hot-toast";
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { functions } from "../firebase/firebaseConfig";
import type { StripeConnectStatus } from "../types/StripeCheckout";

type StripeConnectPanelProps = {
  artist?: {
    stripeConnect?: Partial<StripeConnectStatus>;
    paymentType?: string;
  } | null;
};

type CallableStatusResponse = {
  status: StripeConnectStatus;
};

type CallableUrlResponse = {
  url: string;
};

type RedirectTarget = "onboarding" | "dashboard" | null;

const emptyStatus: StripeConnectStatus = {
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  onboardingComplete: false,
  disabledReason: "account_missing",
};

const getStripeStatusMessage = (disabledReason?: string | null) => {
  if (!disabledReason || disabledReason === "account_missing") return "";

  switch (disabledReason) {
    case "requirements.past_due":
      return "Stripe needs additional information before your account can accept payments or receive payouts. Finish setup to resolve it.";
    case "requirements.pending_verification":
      return "Stripe is reviewing the information you submitted. No action is needed unless Stripe requests more details.";
    case "requirements.eventually_due":
      return "Stripe will need additional account information soon. You can provide it now to prevent payment interruptions.";
    case "under_review":
      return "Stripe is reviewing your account. Payments will become available after the review is complete.";
    case "listed":
      return "Stripe needs you to review information associated with this account before payments can continue.";
    case "platform_paused":
      return "Payments are temporarily paused. Contact SATX Ink support for help restoring your account.";
    case "rejected.fraud":
    case "rejected.terms_of_service":
    case "rejected.listed":
    case "rejected.other":
      return "Stripe could not approve this account. Open Stripe setup for next steps or contact Stripe support.";
    default:
      if (disabledReason.startsWith("requirements.")) {
        return "Stripe needs more information before payments and payouts can be fully enabled. Continue setup to review the request.";
      }

      return "Stripe needs attention before payments and payouts can be fully enabled. Continue setup for the next step.";
  }
};

const StripeConnectPanel = ({ artist }: StripeConnectPanelProps) => {
  const [status, setStatus] = useState<StripeConnectStatus>({
    ...emptyStatus,
    ...artist?.stripeConnect,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [redirectTarget, setRedirectTarget] =
    useState<RedirectTarget>(null);

  const isConnected = status.onboardingComplete;
  const isRedirecting = redirectTarget !== null;
  const statusLabel = useMemo(() => {
    if (isConnected) return "Ready for client deposits";
    if (status.accountId && status.detailsSubmitted) return "Under review";
    if (status.accountId) return "Setup needs attention";
    return "Not connected";
  }, [isConnected, status.accountId, status.detailsSubmitted]);
  const statusMessage = useMemo(
    () => getStripeStatusMessage(status.disabledReason),
    [status.disabledReason]
  );

  const refreshStatus = async ({ quiet = false } = {}) => {
    try {
      setIsLoading(true);
      const getStatus = httpsCallable<void, CallableStatusResponse>(
        functions,
        "getStripeConnectStatus"
      );
      const response = await getStatus();
      setStatus(response.data.status);
      if (!quiet) toast.success("Stripe status refreshed.");
    } catch (err) {
      console.error("Failed to refresh Stripe status:", err);
      if (!quiet) toast.error("Could not refresh Stripe status.");
    } finally {
      setIsLoading(false);
    }
  };

  const startOnboarding = async () => {
    try {
      setRedirectTarget("onboarding");
      const createLink = httpsCallable<
        { returnUrl: string; origin: string },
        CallableUrlResponse
      >(functions, "createStripeConnectOnboardingLink");
      const response = await createLink({
        returnUrl: window.location.href,
        origin: window.location.origin,
      });
      window.location.href = response.data.url;
    } catch (err) {
      console.error("Failed to create Stripe onboarding link:", err);
      toast.error("Could not open Stripe onboarding.");
      setRedirectTarget(null);
    }
  };

  const openStripeDashboard = async () => {
    try {
      setRedirectTarget("dashboard");
      const createLoginLink = httpsCallable<void, CallableUrlResponse>(
        functions,
        "createStripeDashboardLoginLink"
      );
      const response = await createLoginLink();
      window.location.href = response.data.url;
    } catch (err) {
      console.error("Failed to create Stripe dashboard link:", err);
      toast.error("Could not open the Stripe dashboard.");
      setRedirectTarget(null);
    }
  };

  useEffect(() => {
    refreshStatus({ quiet: true });
  }, []);

  useEffect(() => {
    setStatus((current) => ({ ...current, ...artist?.stripeConnect }));
  }, [artist?.stripeConnect]);

  return (
    <section className="w-full max-w-5xl space-y-4">
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent p-4 shadow-2xl sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
              <CreditCard size={15} />
              Payments
            </div>
            <h2 className="mt-4 text-2xl! font-semibold text-white sm:text-3xl!">
              Stripe Connect payouts
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/55">
              Connect Stripe so client deposits and post-session balances can
              be sent to your account. Finish setup before sending paid offers.
            </p>
          </div>

          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              isConnected
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
                : "border-amber-300/20 bg-amber-300/10 text-amber-100"
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {isConnected ? (
                <CheckCircle2 size={18} />
              ) : (
                <ShieldCheck size={18} />
              )}
              {statusLabel}
            </div>
            {statusMessage && (
              <p className="mt-2 max-w-sm text-xs leading-5 opacity-80">
                {statusMessage}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <StatusTile
            label="Accept card payments"
            active={status.chargesEnabled}
          />
          <StatusTile label="Receive payouts" active={status.payoutsEnabled} />
          <StatusTile
            label="Business details submitted"
            active={status.detailsSubmitted}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={startOnboarding}
            disabled={isRedirecting}
            aria-busy={redirectTarget === "onboarding"}
            className="inline-flex min-w-[164px] items-center justify-center gap-2 rounded-md border border-white/15 bg-white/[0.07] px-4! py-2.5! text-sm! font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.11] disabled:cursor-wait disabled:opacity-65"
          >
            {redirectTarget === "onboarding" ? (
              <>
                <LoaderCircle size={16} className="animate-spin" />
                Opening setup...
              </>
            ) : (
              <>
                {status.accountId ? "Finish Stripe setup" : "Connect Stripe"}
                <ArrowUpRight size={16} />
              </>
            )}
          </button>

          {status.accountId && (
            <button
              type="button"
              onClick={openStripeDashboard}
              disabled={isRedirecting}
              aria-busy={redirectTarget === "dashboard"}
              className="inline-flex min-w-[162px] items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-4! py-2.5! text-sm! font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white disabled:cursor-wait disabled:opacity-65"
            >
              {redirectTarget === "dashboard" ? (
                <>
                  <LoaderCircle size={16} className="animate-spin" />
                  Opening dashboard...
                </>
              ) : (
                <>
                  Stripe dashboard
                  <ExternalLink size={16} />
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => refreshStatus()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-4! py-2.5! text-sm! font-semibold text-white/65 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Refresh status
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {redirectTarget === "onboarding"
            ? "Preparing Stripe setup. You will be redirected shortly."
            : redirectTarget === "dashboard"
              ? "Preparing your Stripe dashboard. You will be redirected shortly."
              : ""}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard
          title="How client payments work"
          body="When a client accepts an offer, Checkout is created on your connected Stripe account. SATX Ink applies a hybrid platform fee of $5 minimum, 10%, capped at $10, and the client covers that fee plus estimated Stripe processing."
        />
        <InfoCard
          title="Before taking paid requests"
          body="Finish onboarding first. Session deposits and post-session Stripe balances require card payments to be enabled on your connected Stripe account."
        />
      </div>
    </section>
  );
};

const StatusTile = ({ label, active }: { label: string; active: boolean }) => (
  <div className="rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-semibold text-white/75">{label}</p>
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          active ? "bg-emerald-300" : "bg-white/20"
        }`}
      />
    </div>
    <p className="mt-2 text-xs text-white/40">{active ? "Ready" : "Pending"}</p>
  </div>
);

const InfoCard = ({ title, body }: { title: string; body: string }) => (
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
    <h3 className="text-base font-semibold text-white">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-white/50">{body}</p>
  </div>
);

export default StripeConnectPanel;
