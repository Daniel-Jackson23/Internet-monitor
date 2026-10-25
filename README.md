# Internet Monitor

Checks your internet connection every minute, records the results, and emails you an outage report once the connection comes back.

- `monitor.py`: check loop + FastAPI server (SQLite in `data/`)
- `web/`: React dashboard, served by the backend
- `mobile/`: Expo (React Native) app
- `shared/`: API client used by both frontends

## Run with Docker

```sh
docker compose up -d --build
```

Dashboard: http://localhost:8090. Settings come from `.env`:

| Variable | Default | |
|---|---|---|
| `EMAIL_FROM`, `EMAIL_PASS`, `EMAIL_TO` | | Gmail sender, app password and recipient. Leave `EMAIL_FROM` empty to disable email |
| `CHECK_INTERVAL` | `60` | Seconds between checks |
| `CHECK_HOST` / `CHECK_PORT` | `8.8.8.8` / `53` | What to connect to |

## Development

```sh
pip install -r requirements-dev.txt
python monitor.py              # API on :8090
cd web && npm install && npm run dev   # dashboard on :5180, proxies /api
pytest && ruff check .
```

## Mobile app

```sh
cd mobile && npm install && npx expo start
```

Scan the QR code with Expo Go on your phone (it must be on the same Wi-Fi). On first launch, enter the monitor's address, e.g. `http://192.168.0.100:8090`. Use your PC's LAN IP (`ipconfig`), not `localhost`.
