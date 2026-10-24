import { Auth0Provider } from "@auth0/auth0-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const domain = import.meta.env.VITE_AUTH0_DOMAIN as string | undefined;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined;
const audience = import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined;
export const authEnabled = Boolean(domain && clientId && audience);

const app = <App authEnabled={authEnabled} />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {authEnabled ? (
      <Auth0Provider
        domain={domain!}
        clientId={clientId!}
        authorizationParams={{ redirect_uri: window.location.origin, audience }}
        cacheLocation="localstorage"
      >
        {app}
      </Auth0Provider>
    ) : (
      app
    )}
  </StrictMode>,
);
