# Four Seasons Hosting deployment outline

The application is designed for a CloudLinux Node.js application on the `gamenights.sayrejeri.com` subdomain and a dedicated MariaDB/MySQL database.

## Hosting prerequisites

- Node.js 20.9 or newer; Node.js 22 is preferred
- A dedicated database and database user
- HTTPS enabled for `gamenights.sayrejeri.com`
- Ability to set environment variables in the Node.js app manager
- A Discord Developer Portal application

## Create the Node.js application

Use these values in **Setup Node.js App**:

- Node.js version: newest available 22.x, otherwise newest 20.x
- Application mode: `Production`
- Application root: `domains/gamenights.sayrejeri.com/app`
- Application URL: `gamenights.sayrejeri.com` with the path left blank
- Application startup file: `server.js`

The application root is relative to the hosting account home directory. Keeping the source in the private `app` directory prevents configuration and source files from being served as ordinary public files.

## Database

1. Create a database such as `sayrejeri_gamenights`.
2. Create a separate database user and grant it access only to this database.
3. Open phpMyAdmin and import `database/001_initial.sql`.
4. Build the `DATABASE_URL` value in this form:

```text
mysql://USER:PASSWORD@HOST:3306/DATABASE
```

URL-encode special characters in the username or password.

## Discord application

Create an OAuth2 application and add this redirect:

```text
https://gamenights.sayrejeri.com/api/auth/discord/callback
```

The website requests `identify`, `guilds`, and `connections`. A bot is not required.

## Upload and build

1. Place the GitHub repository contents in `domains/gamenights.sayrejeri.com/app`.
2. Use the hosting panel's **Run npm install** action, or run `npm install` inside the application environment.
3. Run the package script `build` with `npm run build`.
4. Confirm the startup file remains `server.js`.
5. Add every value from `.env.example` through the environment-variable controls.
6. Restart the application.

`server.js` uses the host-provided `PORT` value and listens on `0.0.0.0`, allowing CloudLinux Passenger to route the subdomain to Next.js.
