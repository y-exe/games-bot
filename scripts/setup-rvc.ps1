param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path '.local/rvc/tools/infer_cli.py') -or -not (Test-Path '.local/rvc-assets/ymkw.pth')) {
  throw 'RVCのコードとモデルを .local に配置してから実行してください。'
}
if (-not (Test-Path '.rvc/Scripts/python.exe')) { & $Python -m venv .rvc }
$taskPython = Join-Path (Get-Location) '.rvc/Scripts/python.exe'
& $taskPython -m pip install --upgrade pip==24.0 wheel
if ($LASTEXITCODE -ne 0) { throw 'pipの準備に失敗しました。' }
& $taskPython -m pip install --extra-index-url https://download.pytorch.org/whl/cpu torch==2.5.1+cpu torchaudio==2.5.1+cpu
if ($LASTEXITCODE -ne 0) { throw 'CPU用Torchのインストールに失敗しました。' }
$taskRequirements = Get-Content '.local/rvc/requirements-py311.txt' | Where-Object { $_ -notmatch '^fairseq ' -and $_ -ne 'numpy' }
$taskRequirements += 'numpy==1.26.4'
[IO.File]::WriteAllLines((Join-Path (Get-Location) '.local/rvc-requirements-windows.txt'), $taskRequirements)
& $taskPython -m pip install -r .local/rvc-requirements-windows.txt
if ($LASTEXITCODE -ne 0) { throw 'RVC依存ライブラリのインストールに失敗しました。' }
if (-not (Test-Path '.local/fairseq/setup.py')) { git clone https://github.com/One-sixth/fairseq.git .local/fairseq }
git -C .local/fairseq checkout 44800430a728c2216fd1cf1e8daa672f50dfacba
if ($LASTEXITCODE -ne 0) { throw 'fairseqの取得に失敗しました。' }
$taskPreviousReadTheDocs = $env:READTHEDOCS
$taskPreviousPythonUtf8 = $env:PYTHONUTF8
try {
  $env:READTHEDOCS = '1'
  $env:PYTHONUTF8 = '1'
  & $taskPython -m pip install --no-build-isolation .local/fairseq
  if ($LASTEXITCODE -ne 0) { throw 'fairseqのインストールに失敗しました。' }
} finally {
  $env:READTHEDOCS = $taskPreviousReadTheDocs
  $env:PYTHONUTF8 = $taskPreviousPythonUtf8
}
Write-Output 'RVC推論環境を準備しました。テストBotのvoiceコマンドで変換を確認してください。'
