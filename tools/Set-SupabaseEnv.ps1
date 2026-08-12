<#
.SYNOPSIS
Populate SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for service-role scripts,
keeping the key in Windows Credential Manager instead of on disk.

.DESCRIPTION
The Deno service-role scripts under supabase/functions/scripts/ (seed-case-studies,
export-fixtures) need the project's service-role key. That key bypasses RLS, so it must
never land in .env, a shell history, or a commit.

This dot-sourced helper keeps it in Windows Credential Manager under the generic
credential EZVote:SupabaseServiceRoleKey. On first use it fetches the key from the linked
Supabase CLI project and stores it; afterwards it reads it straight from the vault. The
value is never printed, never written to a file, and never passed on a command line
(CredWrite is called directly rather than shelling out to cmdkey, whose arguments would be
briefly visible to other processes).

SUPABASE_URL is not secret and is read from the repo-root .env, or supplied with -Url.

Windows-only convenience. Nothing in the repo depends on it - any other way of getting
those two variables into the environment works just as well.

.EXAMPLE
. .\tools\Set-SupabaseEnv.ps1
cd supabase\functions; deno task seed-case-studies -- --dry-run

.EXAMPLE
. .\tools\Set-SupabaseEnv.ps1 -Refresh    # key rotated: re-fetch and re-store

.EXAMPLE
. .\tools\Set-SupabaseEnv.ps1 -Clear      # forget the stored key
#>
[CmdletBinding()]
param(
    [string]$Url,
    [string]$Target = 'EZVote:SupabaseServiceRoleKey',
    [switch]$Refresh,
    [switch]$Clear
)

if (-not ('EZVoteCredential' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

// Minimal CredRead/CredWrite/CredDelete wrapper for CRED_TYPE_GENERIC (1).
public class EZVoteCredential {
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredReadW(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredWriteW(ref CREDENTIAL credential, uint flags);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredDeleteW(string target, uint type, uint flags);
    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr buffer);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public long LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    public static string Read(string target) {
        IntPtr ptr;
        if (!CredReadW(target, 1, 0, out ptr)) { return null; }
        try {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            return Marshal.PtrToStringUni(cred.CredentialBlob, (int)(cred.CredentialBlobSize / 2));
        } finally {
            CredFree(ptr);
        }
    }

    public static void Write(string target, string userName, string secret) {
        IntPtr blob = Marshal.StringToCoTaskMemUni(secret);
        try {
            CREDENTIAL cred = new CREDENTIAL();
            cred.Type = 1;                                  // CRED_TYPE_GENERIC
            cred.TargetName = target;
            cred.UserName = userName;
            cred.CredentialBlob = blob;
            cred.CredentialBlobSize = (uint)(secret.Length * 2);
            cred.Persist = 2;                               // CRED_PERSIST_LOCAL_MACHINE
            if (!CredWriteW(ref cred, 0)) {
                throw new Exception("CredWrite failed: " + Marshal.GetLastWin32Error());
            }
        } finally {
            Marshal.ZeroFreeCoTaskMemUnicode(blob);
        }
    }

    public static bool Delete(string target) {
        return CredDeleteW(target, 1, 0);
    }
}
'@
}

if ($Clear) {
    if ([EZVoteCredential]::Delete($Target)) {
        Write-Host "Removed $Target from Credential Manager."
    }
    else {
        Write-Host "$Target was not stored."
    }
    $env:SUPABASE_SERVICE_ROLE_KEY = $null
    return
}

# --- SUPABASE_URL (not secret) ---
if (-not $Url) {
    $envFile = Join-Path $PSScriptRoot '..\.env'
    if (Test-Path $envFile) {
        $line = Select-String -Path $envFile -Pattern '^\s*SUPABASE_URL\s*=' | Select-Object -First 1
        if ($line) { $Url = ($line.Line -split '=', 2)[1].Trim().Trim('"') }
    }
}
if (-not $Url) {
    throw "SUPABASE_URL not found in .env - pass -Url https://<ref>.supabase.co"
}
$env:SUPABASE_URL = $Url

# --- Service-role key ---
$key = $null
if (-not $Refresh) { $key = [EZVoteCredential]::Read($Target) }

if (-not $key) {
    # Project ref is the first label of the project URL.
    $ref = ([uri]$Url).Host.Split('.')[0]
    Write-Host "Fetching the service-role key for $ref from the Supabase CLI..."
    $json = supabase projects api-keys --project-ref $ref -o json
    if ($LASTEXITCODE -ne 0) {
        throw "supabase projects api-keys failed - run 'supabase login' first."
    }
    $entry = ($json | ConvertFrom-Json) | Where-Object { $_.name -eq 'service_role' } | Select-Object -First 1
    if (-not $entry) { throw "No service_role key returned for $ref." }
    $key = $entry.api_key
    [EZVoteCredential]::Write($Target, $ref, $key)
    Write-Host "Stored it in Credential Manager as $Target."
}

$env:SUPABASE_SERVICE_ROLE_KEY = $key
Write-Host "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set for this session."
