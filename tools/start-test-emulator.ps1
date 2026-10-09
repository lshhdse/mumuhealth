$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$sdkDir = Join-Path $projectDir '.tools\sdk'
$avdDir = Join-Path $projectDir '.tools\avd'
$deviceDir = Join-Path $avdDir 'mumu-test.avd'
New-Item -ItemType Directory -Force -Path $deviceDir | Out-Null
$config = @"
AvdId=mumu-test
avd.ini.encoding=UTF-8
hw.cpu.arch=x86_64
hw.cpu.ncore=1
hw.lcd.width=1080
hw.lcd.height=2340
hw.lcd.density=440
hw.ramSize=2048
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader
hw.keyboard=yes
hw.camera.back=emulated
hw.camera.front=none
hw.mainKeys=no
hw.audioInput=no
disk.dataPartition.size=2G
image.sysdir.1=$($sdkDir.Replace('\','/'))/system-images/android-35/default/x86_64/
tag.id=default
tag.display=Default
abi.type=x86_64
target=android-35
showDeviceFrame=no
"@
[System.IO.File]::WriteAllText((Join-Path $deviceDir 'config.ini'), $config, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText((Join-Path $avdDir 'mumu-test.ini'), "avd.ini.encoding=UTF-8`npath=$deviceDir`ntarget=android-35`n", [System.Text.UTF8Encoding]::new($false))
Expand-Archive -LiteralPath (Join-Path $projectDir '.tools\platform-tools.zip') -DestinationPath $sdkDir -Force
$env:ANDROID_AVD_HOME = $avdDir
$env:ANDROID_SDK_ROOT = $sdkDir
$env:ANDROID_USER_HOME = Join-Path $projectDir '.tools\android-user'
$env:ANDROID_I_WANT_MY_TCG = 'yes'
$emulator = Join-Path $sdkDir 'emulator\emulator.exe'
$process = Start-Process -FilePath $emulator -ArgumentList @('-avd','mumu-test','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-accel','off','-gpu','swiftshader_indirect','-memory','2048','-cores','1','-feature','-Vulkan','-show-kernel') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectDir 'build\emulator.log') -RedirectStandardError (Join-Path $projectDir 'build\emulator-error.log')
Write-Output ('Emulator PID: ' + $process.Id)
