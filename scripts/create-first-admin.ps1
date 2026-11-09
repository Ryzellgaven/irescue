<#[SYNOPSIS]
Creates the first administrator account using the one-time Cloudflare Worker bootstrap.

.EXAMPLE
.\scripts\create-first-admin.ps1 -GenerateToken
Paste the generated clipboard value into the Production BOOTSTRAP_ADMIN_TOKEN secret in Cloudflare and deploy.

.EXAMPLE
.\scripts\create-first-admin.ps1
After deployment, enter the same bootstrap token and your new admin password at the hidden prompts.
#>
[CmdletBinding()]
param(
    [switch]$GenerateToken
)

$ErrorActionPreference = 'Stop'
$setupUri = 'https://irescue-diplahan.ldrrmo.workers.dev/api/index.php?action=bootstrap-admin'

if ($GenerateToken) {
    $randomBytes = New-Object byte[] 32
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()

    try {
        $randomGenerator.GetBytes($randomBytes)
        $generatedToken = [Convert]::ToBase64String($randomBytes)
        Set-Clipboard -Value $generatedToken
        Write-Host 'A 44-character bootstrap token was generated and copied to the clipboard.'
        Write-Host 'Paste it as the BOOTSTRAP_ADMIN_TOKEN Production secret in Cloudflare, then deploy.'
        Write-Host 'Keep the token private. Run this script again without -GenerateToken after deployment.'
    }
    finally {
        $randomGenerator.Dispose()
        [Array]::Clear($randomBytes, 0, $randomBytes.Length)
        Remove-Variable generatedToken -ErrorAction SilentlyContinue
    }

    return
}

$tokenSecure = $null
$passwordSecure = $null
$tokenPointer = [IntPtr]::Zero
$passwordPointer = [IntPtr]::Zero
$token = $null
$password = $null
$requestBody = $null

try {
    $tokenSecure = Read-Host 'Paste the BOOTSTRAP_ADMIN_TOKEN value' -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)

    if ([Text.Encoding]::UTF8.GetByteCount($token) -lt 32) {
        throw 'The bootstrap token must be at least 32 characters. Generate a new one with -GenerateToken, update the Cloudflare secret, and deploy before continuing.'
    }

    $passwordSecure = Read-Host 'Choose a new admin password (8-72 bytes)' -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)

    $passwordBytes = [Text.Encoding]::UTF8.GetByteCount($password)
    if ($passwordBytes -lt 8 -or $passwordBytes -gt 72) {
        throw 'The admin password must be between 8 and 72 UTF-8 bytes. Run the script again with a different password.'
    }

    $requestBody = @{
        full_name = 'LDRRMO Administrator'
        email = 'admin@ldrrmo.gov.ph'
        password = $password
    } | ConvertTo-Json -Compress

    $response = Invoke-RestMethod -Method Post `
        -Uri $setupUri `
        -Headers @{ 'X-Admin-Bootstrap-Token' = $token } `
        -ContentType 'application/json' `
        -Body $requestBody `
        -TimeoutSec 30

    if ($response.created -ne $true) {
        throw 'The server did not confirm administrator creation. Check the response and try again if appropriate.'
    }

    Write-Host 'Admin account created. Sign in with admin@ldrrmo.gov.ph and the password you just chose.'
    Write-Host 'Remove BOOTSTRAP_ADMIN_TOKEN from the Worker Production secrets in Cloudflare now.'
}
finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($randomBytes) {
        [Array]::Clear($randomBytes, 0, $randomBytes.Length)
    }
    Remove-Variable token, password, requestBody, response, tokenSecure, passwordSecure, passwordBytes -ErrorAction SilentlyContinue
}
