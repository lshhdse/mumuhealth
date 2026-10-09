$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$toolDir = Join-Path $projectDir '.tools'
New-Item -ItemType Directory -Force -Path $toolDir | Out-Null
$repositoryFile = Join-Path $toolDir 'repository.xml'
Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/repository2-1.xml' -OutFile $repositoryFile -TimeoutSec 60
[xml]$repository = Get-Content -LiteralPath $repositoryFile
$packages = @(@{ Path='platforms;android-35'; Dest='platform' }, @{ Path='build-tools;35.0.0'; Dest='build-tools' }, @{ Path='platform-tools'; Dest='platform-tools' })
foreach ($package in $packages) {
    $remote = @($repository.'sdk-repository'.remotePackage | Where-Object { $_.path -eq $package.Path })[0]
    $archive = @($remote.archives.archive | Where-Object { -not $_.'host-os' -or $_.'host-os' -eq 'windows' })[0]
    $zip = Join-Path $toolDir ($package.Dest + '.zip')
    if (!(Test-Path -LiteralPath $zip)) { Invoke-WebRequest -Uri ('https://dl.google.com/android/repository/' + $archive.complete.url) -OutFile $zip -TimeoutSec 300 }
    $expected = if ($archive.complete.checksum.InnerText) { $archive.complete.checksum.InnerText } else { [string]$archive.complete.checksum }
    if ((Get-FileHash -LiteralPath $zip -Algorithm SHA1).Hash.ToLower() -ne $expected.ToLower()) { throw ('校验失败：' + $package.Path) }
    Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $toolDir $package.Dest) -Force
    Write-Output ('Ready: ' + $package.Path)
}
