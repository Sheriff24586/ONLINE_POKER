$ErrorActionPreference = 'Stop'
if (-not (Test-Path '.venv')) { python -m venv .venv }
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
& .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
New-Item -ItemType Directory -Force -Path static\js | Out-Null
Invoke-WebRequest "https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.8.1/socket.io.min.js" -OutFile "static\js\socket.io.min.js"
Write-Host "Setup complete. Start with: python app.py" -ForegroundColor Green
