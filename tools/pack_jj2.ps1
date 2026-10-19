# Pack the files the game uses from a Jazz Jackrabbit 2 install into three
# zips for Levels/ (each under GitHub's 25 MB upload limit):
#   JJ2-Levels.zip      levels (.j2l, with JJ2+ scripts), tile sets, episodes, plus.j2a
#   JJ2-Music.zip       the soundtrack (.j2b, .it, .mod, .s3m, .xm, .mo3, .ogg)
#   JJ2-Cinematics.zip  the intro, ending and logo videos (.j2v)
#
# Run it in PowerShell (paste it in, or: powershell -ExecutionPolicy Bypass -File pack_jj2.ps1).
# $Source: the main JJ2 folder (The Secret Files / JJ2+ install).
# $Christmas: optional, the Christmas Chronicles folder (its Xmas levels).

$Source    = 'C:\GOG Games\Jazz Jackrabbit3'
$Christmas = ''                     # e.g. 'C:\GOG Games\Jazz Jackrabbit 2 CC'
$Out       = Join-Path $env:USERPROFILE 'Desktop\JJ2-zips'

# The folder as given, or else any folder under C:\GOG Games with Jazz2.exe in it.
if (-not (Test-Path (Join-Path $Source 'Jazz2.exe'))) {
    $found = Get-ChildItem 'C:\GOG Games' -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'Jazz2.exe') }
    if (-not $found) { Write-Host "No Jazz2.exe in '$Source' or under C:\GOG Games. Set `$Source to your JJ2 folder." -ForegroundColor Red; return }
    Write-Host 'JJ2 folders found:'; $found | ForEach-Object { Write-Host "  $($_.FullName)" }
    # The one with the original episodes (Prince.j2e) is the main install.
    $main = $found | Where-Object { Test-Path (Join-Path $_.FullName 'Prince.j2e') } | Select-Object -First 1
    if (-not $main) { $main = $found[0] }
    $Source = $main.FullName
    if (-not $Christmas) {
        $cc = $found | Where-Object { Test-Path (Join-Path $_.FullName 'Xmas99.j2e') } | Select-Object -First 1
        if ($cc -and $cc.FullName -ne $Source) { $Christmas = $cc.FullName }
    }
}
Write-Host "Main install: $Source"
if ($Christmas) { Write-Host "Christmas Chronicles: $Christmas" }

$stage = Join-Path $env:TEMP 'jj2-pack'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Out | Out-Null

# Copy matching files from a folder (and its UserLevels) into a staging folder;
# a name already there is kept (the main install wins).
function Collect($from, $patterns, $to, $skip) {
    if (-not $from -or -not (Test-Path $from)) { return }
    New-Item -ItemType Directory -Force -Path $to | Out-Null
    foreach ($dir in @($from, (Join-Path $from 'UserLevels'))) {
        if (-not (Test-Path $dir)) { continue }
        foreach ($p in $patterns) {
            Get-ChildItem -Path $dir -Filter $p -File -ErrorAction SilentlyContinue | ForEach-Object {
                if ($skip -and $_.Name -like $skip) { return }
                $dest = Join-Path $to $_.Name
                if (-not (Test-Path $dest)) { Copy-Item $_.FullName $dest }
            }
        }
    }
}

function Pack($name, $dir) {
    $zip = Join-Path $Out $name
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $dir) -or -not (Get-ChildItem $dir -File)) { Write-Host "$name : nothing to pack"; return }
    Compress-Archive -Path (Join-Path $dir '*') -DestinationPath $zip -CompressionLevel Optimal
    $mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
    $n = (Get-ChildItem $dir -File).Count
    $warn = if ($mb -ge 25) { '  (over 25 MB: upload with GitHub Desktop or git instead of the web page)' } else { '' }
    Write-Host ("{0,-20} {1,4} files {2,6} MB{3}" -f $name, $n, $mb, $warn)
}

# Levels: the JJ2+ demo levels (plus*.j2l) mostly show off scripting the game can't run.
$levels = Join-Path $stage 'levels'
Collect $Source @('*.j2l', '*.j2t', '*.j2e', '*.j2as', 'plus.j2a') $levels 'plus?*.j2*'
Collect $Christmas @('Xmas*.j2l', 'Xmas*.j2t', 'Xmas99.j2e', 'Xmbattle*.j2l', 'XB-*.j2l', 'XC-*.j2l', 'XE-*.j2l', '*.j2t') $levels $null

$music = Join-Path $stage 'music'
Collect $Source @('*.j2b', '*.it', '*.mod', '*.s3m', '*.xm', '*.mo3', '*.ogg') $music $null
Collect $Christmas @('*.j2b', '*.it', '*.mod', '*.s3m', '*.xm') $music $null

$video = Join-Path $stage 'video'
Collect $Source @('Intro.j2v', 'Ending.j2v', 'Logo.j2v', 'P2.j2v') $video $null
Collect $Christmas @('Intro.j2v', 'Ending.j2v', 'Logo.j2v', 'P2.j2v') $video $null

Write-Host ''
Pack 'JJ2-Levels.zip' $levels
Pack 'JJ2-Music.zip' $music
Pack 'JJ2-Cinematics.zip' $video
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ''
Write-Host "Done: $Out  -  upload the three zips into Levels/ on GitHub." -ForegroundColor Green
explorer $Out
