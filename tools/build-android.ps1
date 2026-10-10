param(
    [string]$JdkPath = 'D:\work\Java\ms-17.0.19',
    [switch]$Debug,
    [int]$VersionCode = 7,
    [string]$VersionName = '',
    [switch]$RequireExistingSigning
)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$appVersion = if ($VersionName) { $VersionName } else { (Get-Content -LiteralPath (Join-Path $projectDir 'package.json') -Raw | ConvertFrom-Json).version }
if ($VersionCode -lt 1) { throw '版本编号必须大于 0。' }
Push-Location $projectDir
try { & node (Join-Path $PSScriptRoot 'build-web.mjs'); if ($LASTEXITCODE -ne 0) { throw '界面打包失败。' } }
finally { Pop-Location }
$toolDir = Join-Path $projectDir '.tools'
$outputDir = Join-Path $projectDir 'build'
$javaPath = Join-Path $JdkPath 'bin\java.exe'
if (!(Test-Path -LiteralPath $javaPath)) { throw '需要 JDK 17。请通过 -JdkPath 指定安装目录。' }
$androidJar = (Get-ChildItem -LiteralPath (Join-Path $toolDir 'platform') -Recurse -Filter android.jar | Select-Object -First 1).FullName
$aapt = (Get-ChildItem -LiteralPath (Join-Path $toolDir 'build-tools') -Recurse -Filter aapt.exe | Select-Object -First 1).FullName
if (!$androidJar -or !$aapt) { throw '请先运行 tools/setup-android.ps1 下载 Android 工具。' }
$buildTools = Split-Path -Parent $aapt
$variant = if ($Debug) { 'debug' } else { 'release' }
$generatedDir = Join-Path $outputDir ($variant + '\generated')
$classesDir = Join-Path $outputDir ($variant + '\classes')
$signingDir = Join-Path $toolDir 'signing'
New-Item -ItemType Directory -Force -Path $outputDir,$generatedDir,$classesDir,$signingDir | Out-Null
$manifest = Join-Path $projectDir 'app\src\main\AndroidManifest.xml'
if ($Debug) {
    $manifestText = [System.IO.File]::ReadAllText($manifest).Replace('<application ', '<application android:debuggable="true" ').Replace('</manifest>', '<instrumentation android:name="com.mumu.health.TestInstrumentation" android:targetPackage="com.mumu.health" /></manifest>')
    $manifest = Join-Path $outputDir 'debug\AndroidManifest.xml'
    [System.IO.File]::WriteAllText($manifest, $manifestText, [System.Text.UTF8Encoding]::new($false))
}
function Invoke-BuildTool([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw ('构建工具失败：' + [System.IO.Path]::GetFileName($Executable)) }
}
$oldJavaHome = $env:JAVA_HOME
$oldJavaPath = $env:Path
try {
    $env:JAVA_HOME = $JdkPath
    $env:Path = (Join-Path $JdkPath 'bin') + ';' + $env:Path
    $unsigned = Join-Path $outputDir 'app-unsigned.apk'
    Invoke-BuildTool $aapt @('package','-f','-m','-J',$generatedDir,'-M',$manifest,'-S',(Join-Path $projectDir 'app\src\main\res'),'-A',(Join-Path $projectDir 'app\src\main\assets'),'-I',$androidJar,'-F',$unsigned,'--min-sdk-version','26','--target-sdk-version','35','--version-code',([string]$VersionCode),'--version-name',$appVersion)
    $sourceFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectDir 'app\src\main\java') -Recurse -Filter '*.java') + @(Get-ChildItem -LiteralPath $generatedDir -Recurse -Filter '*.java')
    if ($Debug) { $sourceFiles += @(Get-ChildItem -LiteralPath (Join-Path $projectDir 'tests\android') -Filter '*.java') }
    $sourceList = Join-Path $outputDir 'sources.txt'
    [System.IO.File]::WriteAllLines($sourceList, @($sourceFiles | ForEach-Object { '"' + $_.FullName.Replace('\','/') + '"' }), [System.Text.UTF8Encoding]::new($false))
    Invoke-BuildTool (Join-Path $JdkPath 'bin\javac.exe') @('-encoding','UTF-8','-source','8','-target','8','-classpath',$androidJar,'-d',$classesDir,('@' + $sourceList))
    $classesJar = Join-Path $outputDir 'classes.jar'
    Invoke-BuildTool (Join-Path $JdkPath 'bin\jar.exe') @('cf',$classesJar,'-C',$classesDir,'.')
    Invoke-BuildTool (Join-Path $buildTools 'd8.bat') @('--min-api','26','--lib',$androidJar,'--output',$outputDir,$classesJar)
    Invoke-BuildTool (Join-Path $JdkPath 'bin\jar.exe') @('uf',$unsigned,'-C',$outputDir,'classes.dex')
    $aligned = Join-Path $outputDir 'app-aligned.apk'
    Invoke-BuildTool (Join-Path $buildTools 'zipalign.exe') @('-f','4',$unsigned,$aligned)
    $credentialsFile = Join-Path $signingDir 'credentials.json'
    $keystore = Join-Path $signingDir 'mumu-personal.jks'
    if ($RequireExistingSigning -and !(Test-Path -LiteralPath $keystore)) { throw '缺少原有签名文件，拒绝生成新签名。' }
    if ($RequireExistingSigning -and !$env:MUMU_SIGN_PASSWORD) { throw '缺少原有签名密码，拒绝发布。' }
    if (!$RequireExistingSigning -and !(Test-Path -LiteralPath $credentialsFile)) {
        $signingPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
        [System.IO.File]::WriteAllText($credentialsFile, (@{ password = $signingPassword } | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
    }
    if (!$env:MUMU_SIGN_PASSWORD) {
        $credentials = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
        $env:MUMU_SIGN_PASSWORD = $credentials.password
    }
    if (!(Test-Path -LiteralPath $keystore)) {
        Invoke-BuildTool (Join-Path $JdkPath 'bin\keytool.exe') @('-genkeypair','-keystore',$keystore,'-alias','mumu','-keyalg','RSA','-keysize','2048','-validity','10000','-storepass:env','MUMU_SIGN_PASSWORD','-keypass:env','MUMU_SIGN_PASSWORD','-dname','CN=Mumu Health, O=Personal, C=CN')
    }
    $apkName = if ($Debug) { 'mumu-health-debug.apk' } else { "mumu-health-v$appVersion.apk" }
    $apk = Join-Path $outputDir $apkName
    Invoke-BuildTool (Join-Path $buildTools 'apksigner.bat') @('sign','--ks',$keystore,'--ks-key-alias','mumu','--ks-pass','env:MUMU_SIGN_PASSWORD','--key-pass','env:MUMU_SIGN_PASSWORD','--out',$apk,$aligned)
    Invoke-BuildTool (Join-Path $buildTools 'apksigner.bat') @('verify','--verbose',$apk)
    if (!$Debug) {
        Get-ChildItem -LiteralPath $outputDir -Filter 'mumu-health-v*.apk' -File |
            Where-Object { $_.FullName -ne $apk } | Remove-Item -Force
    }
    Write-Output ('APK: ' + $apk)
    Write-Output ('SHA256: ' + (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash)
} finally {
    $env:JAVA_HOME = $oldJavaHome
    $env:Path = $oldJavaPath
    Remove-Item Env:\MUMU_SIGN_PASSWORD -ErrorAction SilentlyContinue
}
