import { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import toast from "react-hot-toast";
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  ExternalLink,
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

const emptyStatus: StripeConnectStatus = {
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  onboardingComplete: false,
  disabledReason: "account_missing",
};

const StripeConnectPanel = ({ artist }: StripeConnectPanelProps) => {
  const [status, setStatus] = useState<StripeConnectStatus>({
    ...emptyStatus,
    ...artist?.stripeConnect,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const isConnected = status.onboardingComplete;
  const statusLabel = useMemo(() => {
    if (isConnected) return "Ready for client deposits";
    if (status.accountId && status.detailsSubmitted) return "Under review";
    if (status.accountId) return "Onboarding needs attention";
    return "Not connected";
  }, [isConnected, status.accountId, status.detailsSubmitted]);

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
      setIsRedirecting(true);
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
      setIsRedirecting(false);
    }
  };

  const openStripeDashboard = async () => {
    try {
      setIsRedirecting(true);
      const createLoginLink = httpsCallable<void, CallableUrlResponse>(
        functions,
        "createStripeDashboardLoginLink"
      );
      const response = await createLoginLink();
      window.location.href = response.data.url;
    } catch (err) {
      console.error("Failed to create Stripe dashboard link:", err);
      toast.error("Could not open the Stripe dashboard.");
      setIsRedirecting(false);
    }
  };

  useEffect(() => {
    refreshStatus({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStatus((current) => ({ ...current, ...artist?.stripeConnect }));
  }, [artist?.stripeConnect]);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.025] to-transparent p-6 shadow-2xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
              <CreditCard size={15} />
              Payments
            </div>
            <h2 className="mt-4 text-3xl! font-semibold text-white">
              Stripe Connect payouts
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/55">
              Connect Stripe so clients can pay deposits through SATX Ink while
              funds route to your connected account. Clients cover the SATX Ink
              platform fee and estimated Stripe processing so your quoted
              deposit is protected.
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
            {status.disabledReason && status.disabledReason !== "account_missing" && (
              <p className="mt-1 text-xs opacity-75">
                Stripe reason: {status.disabledReason}
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
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-4! py-2.5! text-sm! font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status.accountId ? "Continue Stripe setup" : "Connect Stripe"}
            <ArrowUpRight size={16} />
          </button>

          {status.accountId && (
            <button
              type="button"
              onClick={openStripeDashboard}
              disabled={isRedirecting}
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-4! py-2.5! text-sm! font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.09] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stripe dashboard
              <ExternalLink size={16} />
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard
          title="How client payments work"
          body="When a client accepts an offer, Checkout is created on your connected Stripe account. SATX Ink applies a hybrid platform fee of $5 minimum, 10%, capped at $35, and the client covers that fee plus estimated Stripe processing."
        />
        <InfoCard
          title="Before publishing paid events"
          body="Finish onboarding first. Free or info-only events can still be published without Stripe, but paid deposits require card payments to be enabled."
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
  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
    <h3 className="text-base font-semibold text-white">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-white/50">{body}</p>
  </div>
);

export default StripeConnectPanel;
