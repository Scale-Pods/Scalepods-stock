import "server-only";

// In the demonstration there is no real Google login to protect, so a mailbox's stored "login" is a plain label and nothing is encrypted.
export const seal = (plain: string): string => plain;
export const unseal = (sealed: string): string => sealed;
