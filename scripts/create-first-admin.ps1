<#
.SYNOPSIS
Creates the first administrator account using the one-time Cloudflare Worker bootstrap.

.EXAMPLE
.\scripts\create-first-admin.ps1 -GenerateToken
Paste the generated clipboard value into the Production BOOTSTRAP_ADMIN_TOKEN secret in Cloudflare and deploy.

.EXAMPLE
.\scripts\create-first-admin.ps1
After deployment, enter the same bootstrap token and your new admin password at the hidden prompts.
#>

