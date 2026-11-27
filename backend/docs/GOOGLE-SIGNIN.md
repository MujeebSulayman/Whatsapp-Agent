# Sign in with Google

The code is finished and tested. It switches itself on when Google credentials are present, and until then the
sign-in screens show the email form only (no dead buttons).

## Turn it on (about 10 minutes)
1. Go to <https://console.cloud.google.com/> and create a project (or pick one).
2. **APIs & Services → OAuth consent screen**: choose *External*, set the app name (Converso), your support email and
   the developer contact email. Scopes: `openid`, `email`, `profile` (these are the default, non-sensitive ones).
   Click **Publish app** when you are ready for real users. While it is in "Testing", only people you list can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
   Under **Authorized redirect URIs** add exactly:
   - local development: `http://localhost:4000/auth/google/callback`
   - production: `https://<your-api-domain>/auth/google/callback`

   You do not need any "Authorized JavaScript origins": the whole exchange happens on the server.
4. Copy the client ID and secret into `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   API_PUBLIC_URL=http://localhost:4000      # the address Google redirects to (your API's public URL in production)
   FRONTEND_URL=http://localhost:3000        # where people land afterwards (your dashboard URL in production)
   ```
5. Restart the API. "Continue with Google" appears on the sign-in and sign-up screens by itself.

## How it works
1. The button asks the API for a Google URL. The API creates a random `state`, a `nonce` and a PKCE verifier, keeps them in
   Redis for 10 minutes, and returns the URL.
2. Google sends the browser to `/auth/google/callback`. The API checks and burns the `state`, swaps the code for tokens
   (using the client secret and the PKCE verifier), and verifies Google's ID token (signature, issuer, audience, expiry, nonce).
3. Only a **verified** Google email is accepted. The person is then:
   - already linked to Google → signed in;
   - using an email that already has an account → signed into that account and Google is linked to it;
   - brand new → asked for their business details (one screen), then an account with no password is created.
4. The browser never receives tokens. It gets a short-lived, single-use ticket in the redirect URL, which the dashboard swaps
   for a normal session cookie (httpOnly) through its own server.

## Other providers
The flow is built around a small `OidcClient` interface (`api/src/auth/google.client.ts`), so adding a provider means one
more client class and one more button:
- **Microsoft**: free to set up in Azure (Entra ID), same OpenID Connect flow.
- **Facebook / Meta**: possible with your existing Meta developer account (Facebook Login product).
- **Apple**: required by Apple only if you ship an iOS app; needs a paid Apple Developer account.

Not built yet: email verification and password reset (they need an email provider).
