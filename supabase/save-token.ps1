# Saves your Supabase personal access token next to this script (git-ignored),
# so the deploy commands can use it. Input is hidden while you paste.
$secure = Read-Host 'Paste your Supabase token (sbp_...) then press Enter' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim() }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($token -notmatch '^sbp_[A-Za-z0-9]+$') {
  Write-Host 'That does not look like a Supabase token (it should start with sbp_). Nothing saved.' -ForegroundColor Red
  exit 1
}
Set-Content -Path (Join-Path $PSScriptRoot '.access-token') -Value $token -NoNewline -Encoding ascii
Write-Host 'Saved. You can go back to Claude now.' -ForegroundColor Green
