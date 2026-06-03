const PLATFORM_FEE_MIN_CENTS = 500;
const PLATFORM_FEE_MAX_CENTS = 3500;
const PLATFORM_FEE_RATE = 0.1;
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FIXED_FEE_CENTS = 30;

export type PaymentFeeBreakdown = {
  artistAmountCents: number;
  platformFeeCents: number;
  stripeFeeCents: number;
  clientTotalCents: number;
};

export type PaymentFeeOptions = {
  platformFeeBaseAmount?: number;
  platformFeeCentsOverride?: number;
};

export const dollarsToCents = (amount: number) => Math.round(amount * 100);

export const centsToDollars = (amountCents: number) => amountCents / 100;

export const formatMoneyFromCents = (amountCents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(centsToDollars(amountCents));

export const calculatePlatformFeeCents = (artistAmountCents: number) => {
  if (!Number.isFinite(artistAmountCents) || artistAmountCents <= 0) return 0;

  const percentageFee = Math.round(artistAmountCents * PLATFORM_FEE_RATE);
  return Math.min(
    Math.max(percentageFee, PLATFORM_FEE_MIN_CENTS),
    PLATFORM_FEE_MAX_CENTS
  );
};

export const estimateStripeFeeCents = (clientTotalCents: number) =>
  Math.round(clientTotalCents * STRIPE_PERCENT_FEE) + STRIPE_FIXED_FEE_CENTS;

export const calculateClientPaymentBreakdown = (
  artistAmount: number,
  options: PaymentFeeOptions = {}
): PaymentFeeBreakdown => {
  const parsedArtistAmountCents = dollarsToCents(artistAmount);
  const artistAmountCents = Number.isFinite(parsedArtistAmountCents)
    ? Math.max(parsedArtistAmountCents, 0)
    : 0;
  const hasPlatformFeeOverride =
    typeof options.platformFeeCentsOverride === "number";
  const platformFeeOverrideCents = hasPlatformFeeOverride
    ? Math.max(Math.round(options.platformFeeCentsOverride || 0), 0)
    : 0;

  if (
    artistAmountCents <= 0 &&
    platformFeeOverrideCents <= 0
  ) {
    return {
      artistAmountCents: 0,
      platformFeeCents: 0,
      stripeFeeCents: 0,
      clientTotalCents: 0,
    };
  }

  const platformFeeCents =
    hasPlatformFeeOverride
      ? platformFeeOverrideCents
      : calculatePlatformFeeCents(
          dollarsToCents(options.platformFeeBaseAmount ?? artistAmount)
        );
  let clientTotalCents = Math.ceil(
    (artistAmountCents + platformFeeCents + STRIPE_FIXED_FEE_CENTS) /
      (1 - STRIPE_PERCENT_FEE)
  );

  let stripeFeeCents = estimateStripeFeeCents(clientTotalCents);

  while (
    clientTotalCents - stripeFeeCents - platformFeeCents <
    artistAmountCents
  ) {
    clientTotalCents += 1;
    stripeFeeCents = estimateStripeFeeCents(clientTotalCents);
  }

  return {
    artistAmountCents,
    platformFeeCents,
    stripeFeeCents,
    clientTotalCents,
  };
};
