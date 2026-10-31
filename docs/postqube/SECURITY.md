# Security

Never commit .env files, tokens, OAuth codes, passwords/hashes, database dumps,
private uploads, backups or real customer screenshots. Use .env.example with blank
or unmistakable placeholder values. Check Git history before publishing, not only
the working directory. Rotate exposed credentials even if a commit is later removed.

Current authentication is native: bcrypt passwords, signed JWT cookies, workspace
roles and database-resolved global administration. Review session expiry/revocation,
password policy and abuse prevention before wider public use. Use MFA for operator
GitHub/Meta/provider accounts. Do not give global administration to testers.

Do not post vulnerabilities or sensitive logs in public issues. Until an operator
security contact is published, use an established private maintainer channel and
share only minimal reproduction details. Upstream SECURITY.md is preserved as an
upstream policy, not a promise that upstream handles Postqube incidents.

This beta has not undergone a full security audit. Check the launch checklist.
