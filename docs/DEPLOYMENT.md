# Four Seasons Hosting deployment outline

The application is designed for a Node.js application on the `gamenights.sayrejeri.com` subdomain and a dedicated MariaDB/MySQL database.

## Hosting prerequisites

- Node.js 20.9 or newer; Node.js 22 is preferred
- A dedicated database and database user
- HTTPS enabled for `gamenights.sayrejeri.com`
- Ability to set environment variables in the Node.js app manager
- A Discord Developer Portal application

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

## Node application

1. Pull or upload the GitHub repository into the application root.
2. Run `npm install`.
3. Run `npm run build`.
4. Set the startup command to `npm run start` or start the generated standalone server.
5. Add every value from `.env.example` through the host's environment-variable controls.
6. Restart the application.

The exact application root and startup-file fields depend on the Node.js app screen provided by the host. Confirm those fields before the first production deployment.
