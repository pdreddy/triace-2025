# Run Traice in IntelliJ IDEA

1. Install Node.js **22 LTS** (22.12 or newer) and restart IntelliJ if necessary. Node 24 also works for the web/local demo; Firebase Functions targets Node 22.
2. Extract this project and choose **File → Open** in IntelliJ. Select the folder containing `package.json`. Open the Terminal tab in that folder.
3. Verify `node --version` and `npm --version`. In Settings → Languages & Frameworks → Node.js (or JavaScript Runtime), select your Node interpreter if your IntelliJ edition provides JavaScript support. The Terminal method also works without IDE JavaScript support. This is an npm app, not a Java/Maven project.
4. Run:

   ```sh
   npm run setup
   ```

5. In the project tree, copy `.env.demo.example` to **`.env.demo.local`**. Keep the file at the project root. Set `TRAICE_ADMIN_PASSWORD` to a local test password with at least eight characters. Quote values containing `#`. Do not use the `VITE_` prefix for passwords. Username defaults to `reddi2026`.
6. Start the local demo:

   ```sh
   npm run demo
   ```

7. Open the address printed in the Terminal (port 3000). Register a three-player team, check the public Tier list, then choose Admin and sign in using `reddi2026` and the local password you set.

The demo persists test data in `.local-demo/state.json`. It never connects to live Firebase. Stop with Ctrl+C. The login and database files are intentionally excluded from the downloadable archive; you create your own local credentials. Do not delete the `functions/` folder: it contains validation code shared by the app and server.

## Optional IntelliJ Run configuration

Choose Run → Edit Configurations → + → npm (if supported). Select the root `package.json`, command `run`, script `demo`, and your Node interpreter. Alternatively, run `npm run demo` in the Terminal.

## Tests

```sh
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The browser tests start a separate isolated demo on port 3100. Keep that port free. They supply their own test-only admin password; they do not read your registrations or connect to Firebase.

## Firebase testing

See README.md for the full Firebase Emulator setup, initial Firebase admin creation, custom claims, environment variables, deployment, and credential changes. Local demo tests are verified. Real Firebase emulator integration could not be executed in the cloud because its emulator download was blocked by network policy; it is provided for running on your machine. Java 21+ is needed only for that emulator workflow, not the local demo.
