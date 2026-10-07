import type { APIRoute } from "astro";
import { signOut } from "../../lib/me";

export const POST: APIRoute = ({ cookies, redirect }) => {
  signOut(cookies);
  return redirect("/", 303);
};
