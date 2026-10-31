# X and Instagram

## X

Use your own developer app credentials in protected server configuration. Register
https://YOUR_DOMAIN/integrations/social/x as an approved callback. Each user connects
their own X account. Provider usage can cost money; an unrelated app's spending
cap does not protect Postqube. DISABLE_X_ANALYTICS=true is the beta default.

## Instagram

Current beta uses Instagram Standalone. Each connected account must be professional
(Business or Creator). A user's account is distinct from the shared Meta developer
application. Set Instagram-specific credentials, not the general Facebook secret.

1. Create the Meta app and complete required business/security configuration.
2. Configure https://YOUR_DOMAIN/integrations/social/instagram-standalone.
3. Add initial test accounts and accept their tester invitations.
4. Store INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET only in protected server environment.
5. Enable the connection guard only after setup; authorize and verify the result.
6. Review all permissions requested by the installed provider, including basic,
   publishing, comments and insights. Public customer access requires Meta approval.

The Meta dashboard currently presents Unified login for newly created apps. Verify
compatibility with the installed provider before assuming a guide's old labels fit.
Native media formats include image, carousel, Reel and eligible Stories. Interactive
Story links and automatic background comment replies are not promised. Music-library
support differs between Facebook-linked and Standalone providers.

Official guide: https://docs.postiz.com/self-host/providers/instagram
