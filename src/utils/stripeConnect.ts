export type StripeConnectLike = {
  stripeConnect?: {
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
    onboardingComplete?: boolean;
  } | null;
};

export const isStripeConnectReady = (artist?: StripeConnectLike | null) => {
  const stripeConnect = artist?.stripeConnect;

  return Boolean(
    stripeConnect?.onboardingComplete &&
      stripeConnect?.chargesEnabled &&
      stripeConnect?.payoutsEnabled &&
      stripeConnect?.detailsSubmitted
  );
};
