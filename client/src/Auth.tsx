import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { setTokenGetter } from "./api";

/** Only rendered inside Auth0Provider (when Auth0 env vars are set). */
export default function AuthControls() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently, user } = useAuth0();
  useEffect(() => {
    setTokenGetter(isAuthenticated ? () => getAccessTokenSilently().then((t) => t ?? null).catch(() => null) : null);
    return () => setTokenGetter(null);
  }, [isAuthenticated, getAccessTokenSilently]);
  if (isLoading) return null;
  return isAuthenticated ? (
    <div className="flex items-center gap-3 text-sm">
      <a href="#/history" className="underline">History</a>
      <span className="hidden text-slate-600 sm:inline">{user?.email}</span>
      <button className="rounded-lg border border-slate-400 px-3 py-1.5 hover:bg-slate-100" onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}>Log out</button>
    </div>
  ) : (
    <button className="rounded-lg border border-slate-400 px-3 py-1.5 text-sm hover:bg-slate-100" onClick={() => loginWithRedirect()}>Log in to save history</button>
  );
}
