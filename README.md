# ONLINE_POKER

A standalone Python/Flask real-time Texas Hold'em multiplayer web app.

## Flow

Landing page -> Game Setup -> Waiting Room -> Poker Table.

The room creator chooses the table settings. The creator is the initial dealer. The second player joining automatically starts the first hand.

## Rules

- 2 to 10 players per room.
- Temporary player names and six-digit room codes.
- Dealer/SB/BB rotate each hand.
- Custom raise rule: a raise only needs to be greater than the current bet. There is no normal minimum-raise increment, and the maximum is the player's available stack (all-in).
- Server validates actions and keeps the authoritative game state.
- Landscape-first setup/table UI.

## Local setup (Windows / PowerShell)

1. Open this folder in VS Code.
2. Run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup_local.ps1
```

The setup script creates `.venv`, installs `requirements.txt`, and downloads the Socket.IO browser client to `static/js/socket.io.min.js`.

If you prefer manual setup:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Invoke-WebRequest "https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.8.1/socket.io.min.js" -OutFile "static\js\socket.io.min.js"
```

Start the server:

```powershell
python app.py
```

Open `http://127.0.0.1:5000` or the LAN address printed by Flask.

## Tests

```powershell
python -m pytest
```

## Render

`render.yaml` contains the basic web-service configuration. Set a strong `SECRET_KEY` environment variable in production.
