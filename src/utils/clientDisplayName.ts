const DEFAULT_CLIENT_LABEL = "Client";

export type ClientNameSource = {
  firstName?: unknown;
  lastName?: unknown;
  name?: unknown;
  displayName?: unknown;
  clientFirstName?: unknown;
  clientLastName?: unknown;
  clientName?: unknown;
};

export type ClientNameParts = {
  firstName: string;
  lastName: string;
  fullName: string;
};

const normalizeName = (value?: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export const splitFullName = (value?: unknown): ClientNameParts => {
  const normalized = normalizeName(value);
  if (!normalized) return { firstName: "", lastName: "", fullName: "" };

  const displaySource =
    normalized.includes("@") && !normalized.includes(" ")
      ? normalized.split("@")[0]
      : normalized;
  const [firstName = "", ...rest] = displaySource.split(" ");
  const lastName = rest.join(" ");

  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" "),
  };
};

export const formatClientFullName = (
  firstName?: unknown,
  lastName?: unknown,
  fallback = DEFAULT_CLIENT_LABEL
) => {
  const fullName = [normalizeName(firstName), normalizeName(lastName)]
    .filter(Boolean)
    .join(" ");

  return fullName || fallback;
};

export const getClientNameParts = (
  source: ClientNameSource,
  fallback = DEFAULT_CLIENT_LABEL
): ClientNameParts => {
  const legacyFullName =
    normalizeName(source.clientName) ||
    normalizeName(source.name) ||
    normalizeName(source.displayName) ||
    fallback;
  const parsedLegacyName = splitFullName(legacyFullName);
  const firstName =
    normalizeName(source.firstName) ||
    normalizeName(source.clientFirstName) ||
    parsedLegacyName.firstName;
  const lastName =
    normalizeName(source.lastName) ||
    normalizeName(source.clientLastName) ||
    parsedLegacyName.lastName;
  const fullName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    normalizeName(legacyFullName) ||
    fallback;

  return { firstName, lastName, fullName };
};

export const getClientFirstName = (
  source: ClientNameSource,
  fallback = DEFAULT_CLIENT_LABEL
) => getClientNameParts(source, fallback).firstName || fallback;

export const getFullClientNameTitle = (fullName: string, compactName: string) =>
  fullName !== compactName ? fullName : undefined;

export const getCompactClientDisplayName = (
  name?: string | null,
  fallback = DEFAULT_CLIENT_LABEL
) => getClientFirstName({ clientName: name }, fallback);
