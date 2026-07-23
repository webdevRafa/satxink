import type { SessionAllocation } from "../types/Booking";

export const MAX_SESSION_DEPOSIT_RATE = 0.5;

export const toCents = (amount: number) => Math.round(Number(amount || 0) * 100);

export const fromCents = (amountCents: number) =>
  Math.round(Number(amountCents || 0)) / 100;

export const buildEqualSessionAllocations = ({
  totalQuote,
  sessionCount,
  depositAmount,
}: {
  totalQuote: number;
  sessionCount: number;
  depositAmount: number;
}): SessionAllocation[] => {
  const totalQuoteCents = Math.max(toCents(totalQuote), 0);
  const normalizedSessionCount = Math.max(Math.floor(sessionCount || 1), 1);
  const baseSessionCents = Math.floor(totalQuoteCents / normalizedSessionCount);
  const remainderCents = totalQuoteCents % normalizedSessionCount;
  const requestedDepositCents = Math.max(toCents(depositAmount), 0);

  return Array.from({ length: normalizedSessionCount }, (_, index) => {
    const quotedAmountCents =
      baseSessionCents + (index < remainderCents ? 1 : 0);
    const maximumDepositCents = Math.floor(
      quotedAmountCents * MAX_SESSION_DEPOSIT_RATE
    );

    return {
      sessionNumber: index + 1,
      quotedAmountCents,
      depositAmountCents: Math.min(
        requestedDepositCents,
        maximumDepositCents
      ),
    };
  });
};

export const getSessionAllocationError = ({
  totalQuote,
  sessionCount,
  depositAmount,
}: {
  totalQuote: number;
  sessionCount: number;
  depositAmount: number;
}) => {
  if (!Number.isFinite(totalQuote) || totalQuote <= 0) {
    return "Enter a valid project quote.";
  }

  if (!Number.isInteger(sessionCount) || sessionCount < 1 || sessionCount > 12) {
    return "Projects must contain between 1 and 12 sessions.";
  }

  if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
    return "Enter a deposit to reserve each session.";
  }

  const allocations = buildEqualSessionAllocations({
    totalQuote,
    sessionCount,
    depositAmount,
  });
  const smallestSessionCents = Math.min(
    ...allocations.map((allocation) => allocation.quotedAmountCents)
  );
  const maximumDepositCents = Math.floor(
    smallestSessionCents * MAX_SESSION_DEPOSIT_RATE
  );

  if (toCents(depositAmount) > maximumDepositCents) {
    return `The session deposit cannot exceed 50% of the session price (${new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: "USD",
      }
    ).format(fromCents(maximumDepositCents))}).`;
  }

  return null;
};

export const getAllocationForSession = (
  allocations: SessionAllocation[] | undefined,
  sessionNumber: number
) =>
  allocations?.find(
    (allocation) => Number(allocation.sessionNumber) === Number(sessionNumber)
  ) || null;
