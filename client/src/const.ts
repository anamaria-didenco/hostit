export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Always use local password login — Manus OAuth is not used.
export const getLoginUrl = (_returnPath?: string) => "/login";
