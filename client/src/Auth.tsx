import { useAuth0 } from "@auth0/auth0-react";
import { useEffect } from "react";
import { setTokenGetter } from "./api";

export interface AuthState { enabled: boolean; isAuthenticated: boolean; email?: string; login: () => void; signup?: () => void; logout: () => void }

/** Only rendered inside Auth0Provider. Shares the token with the API layer and reports auth state upward. */
export function AuthBridge({ onChange }: { onChange: (s: AuthState) => void }) {
  const { isAuthenticated, isLoading, loginWithRedirect, logout, getAccessTokenSilently, user } = useAuth0();
  useEffect(() => {
    setTokenGetter(isAuthenticated ? () => getAccessTokenSilently().then((t) => t ?? null).catch(() => null) : null);
    return () => setTokenGetter(null);
  }, [isAuthenticated, getAccessTokenSilently]);
  useEffect(() => {
    if (isLoading) return;
    onChange({
      enabled: true, isAuthenticated, email: user?.email,
      login: () => void loginWithRedirect(),
      // Opens Auth0's hosted page on its sign-up screen (same account system as login).
      signup: () => void loginWithRedirect({ authorizationParams: { screen_hint: "signup" } }),
      logout: () => void logout({ logoutParams: { returnTo: window.location.origin } }),
    });
  }, [isLoading, isAuthenticated, user?.email]);
  return null;
}
