# Pack what the game still needs from Jazz Jackrabbit 2: The Christmas
# Chronicles into one zip for Levels/ (about 1 MB):
#   JJ2-Christmas.zip   Xmas1-3 and their episode (Xmas99.j2e), the holiday
#                       multiplayer levels (Xmbattle*, XB-*, XC-*, XE-*), the
#                       tile sets they use that JJ2-Levels.zip lacks, and
#                       Data.j2d (the sounds timed to the intro film)
# Everything else in that install (the other tile sets, the music, the films)
# is already in JJ2-Levels.zip, JJ2-Music.zip and JJ2-Cinematics.zip.
#
# Run it in PowerShell (paste it in, or: powershell -ExecutionPolicy Bypass -File pack_jj2cc.ps1).
# $Christmas: the Christmas Chronicles folder; left empty, it is looked for.

$Christmas = ''                     # e.g. 'C:\GOG Games\Jazz Jackrabbit 2 CC'
$Out       = Join-Path $env:USERPROFILE 'Desktop\JJ2-zips'

# The folder as given, or else the one with Xmas99.j2e in it: under the GOG
# and Program Files folders first, then anywhere on the fixed drives.
function Find-Christmas {
    $roots = @('C:\GOG Games', 'C:\Program Files (x86)\GOG Galaxy\Games', 'C:\Program Files (x86)', 'C:\Program Files', 'C:\Games')
    foreach ($r in $roots) {
        if (-not (Test-Path $r)) { continue }
        $hit = Get-ChildItem $r -Filter 'Xmas99.j2e' -File -Recurse -Depth 2 -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.DirectoryName }
    }
    Write-Host 'Looking on every drive (this can take a minute)...'
    foreach ($d in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Free -ne $null })) {
        $hit = Get-ChildItem $d.Root -Filter 'Xmas99.j2e' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($hit) { return $hit.DirectoryName }
    }
    return $null
}

if (-not $Christmas -or -not (Test-Path (Join-Path $Christmas 'Xmas99.j2e'))) { $Christmas = Find-Christmas }
if (-not $Christmas) { Write-Host "No Christmas Chronicles folder (with Xmas99.j2e) found. Set `$Christmas at the top to it." -ForegroundColor Red; return }
Write-Host "Christmas Chronicles: $Christmas"

$stage = Join-Path $env:TEMP 'jj2cc-pack'
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $stage, $Out | Out-Null

# The levels, the episode, Data.j2d and the tile sets the game doesn't have yet.
$want = @('Xmas*.j2l', 'Xmbattle*.j2l', 'XB-*.j2l', 'XC-*.j2l', 'XE-*.j2l', 'X?-*.j2l',
          'Xmas99.j2e', 'Data.j2d', 'J2LC*.j2t', 'Krype.j2t', '*.j2as')
foreach ($dir in @($Christmas, (Join-Path $Christmas 'UserLevels'))) {
    if (-not (Test-Path $dir)) { continue }
    foreach ($p in $want) {
        Get-ChildItem -Path $dir -Filter $p -File -ErrorAction SilentlyContinue | ForEach-Object {
            $dest = Join-Path $stage $_.Name
            if (-not (Test-Path $dest)) { Copy-Item $_.FullName $dest }
        }
    }
}

$zip = Join-Path $Out 'JJ2-Christmas.zip'
Remove-Item $zip -Force -ErrorAction SilentlyContinue
$files = Get-ChildItem $stage -File
if (-not $files) { Write-Host 'Nothing found to pack.' -ForegroundColor Red; return }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
$files | Sort-Object Name | ForEach-Object { Write-Host ("  {0,-22} {1,8:N0} bytes" -f $_.Name, $_.Length) }
$levels = ($files | Where-Object { $_.Extension -eq '.j2l' }).Count
Write-Host ''
Write-Host ("JJ2-Christmas.zip: {0} files, {1} levels, {2} KB" -f $files.Count, $levels, [math]::Round((Get-Item $zip).Length / 1KB))
Write-Host "Done: $zip  -  upload it into Levels/ on GitHub." -ForegroundColor Green
explorer $Out
