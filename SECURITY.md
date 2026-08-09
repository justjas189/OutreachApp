# Security

Never commit `.env.local`, other real environment files, Google service-account JSON keys, OAuth tokens, private keys, or certificates.

If a credential is exposed, treat it as compromised even if the file or commit is later deleted. Revoke or rotate it immediately in Supabase or Google Cloud, remove it from the repository and Git history, review relevant access logs, and notify the repository maintainer privately. Never paste credentials into a public issue, pull request, chat, or screenshot.
