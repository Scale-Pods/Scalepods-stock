// The demo's sign-in: no real accounts. The "Sign in" button sets a cookie holding the id of one of the demo people (see demo-db/seed), and every page
// and query then runs as that person, with the same roles and row rules as the real product.
export const DEMO_COOKIE = "demo_user";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The people who can be signed in as. The ids are the same in the dummy data (demo-db/seed). */
export const DEMO_USERS = [
  { id: "00000000-0000-4000-8000-0000000000a1", email: "owner@scalepods.demo", name: "Aarav Mehta", role: "owner", label: "Owner" },
  { id: "00000000-0000-4000-8000-0000000000a2", email: "admin@scalepods.demo", name: "Demo Admin", role: "admin", label: "Administrator" },
  { id: "00000000-0000-4000-8000-0000000000a3", email: "approver@scalepods.demo", name: "Riya Shah", role: "approver", label: "Approver" },
  { id: "00000000-0000-4000-8000-0000000000a4", email: "accounts@scalepods.demo", name: "Kabir Nair", role: "accounts", label: "Accounts" },
  { id: "00000000-0000-4000-8000-0000000000a5", email: "viewer@scalepods.demo", name: "Isha Verma", role: "viewer", label: "Viewer" },
] as const;
export const DEFAULT_DEMO_USER = DEMO_USERS[1];
