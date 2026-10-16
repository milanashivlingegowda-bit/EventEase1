# EventEase

A responsive event registration and digital ticket demo built with **HTML, CSS, vanilla JavaScript, Node.js, and Express**.

## Requirements
- Node.js 18 or newer
- VS Code (recommended)

## Run locally
1. Extract the ZIP and open the `EventEase` folder in VS Code.
2. Open Terminal → New Terminal.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open **http://localhost:3000** in your browser.

Keep the terminal running while you use the website. Do not open `index.html` directly; the site needs the Node.js server.

## Demo admin account
- Email: `admin@eventease.com`
- Password: `Admin123!`

Change these before using the project outside a local college demo. The initial admin account is created on first startup using the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables if supplied.

## Included
- Responsive event listing, search and category filters
- User registration/login/logout
- Separate protected admin dashboard
- Participant registration and audience ticket bookings
- Capacity and deadline checks on the server
- Unique booking IDs and printable ticket view
- My Registrations, favourites, profile and theme preference
- Admin event creation/deletion, attendance, registration list and CSV export
- JSON-file persistence in `data/store.json`

## Notes
- This is a student/demo starter, not a production-ready ticketing platform.
- It uses a JSON file as lightweight storage to avoid requiring a separate database installation. Do not run multiple server instances against the same data file.
- The default Express session store is in-memory and is intended for local demos only. For production, use a persistent session store, HTTPS, rate limiting, stronger operational controls, and a proper database.
- Payment status is shown for demo purposes; no real payment processing is connected.
