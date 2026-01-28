---
description: How to deploy the Excel DQM Application
---

The Excel DQM application is a **pure static web application**. It does not require a server, database, or build process. You can deploy it in several ways:

### 1. Simple Local Usage (Recommended for Private Use)
Since the app is built to be CORS-free, you can run it directly from your computer without any hosting.
- Locate the project folder on your computer.
- Double-click `index.html`.
- The app will open in your default browser and is ready to use.

### 2. GitHub Pages (Free & Easy)
Ideal for sharing with a team or hosting publicly.
1. Create a new repository on GitHub.
2. Push the contents of the `excel-dqm-app` folder to the repository.
3. Go to **Settings** > **Pages**.
4. Under **Build and deployment**, set the source to **Deploy from a branch**.
5. Select the `main` branch and the root directory `/`.
6. Click **Save**. Your site will be live at `https://<username>.github.io/<repo-name>/` within a few minutes.

### 3. Vercel or Netlify (Cloud Hosting)
For professional, ultra-fast hosting.
1. Connect your GitHub repository to [Vercel](https://vercel.com) or [Netlify](https://netlify.com).
2. The platforms will automatically detect it as a "Static Site".
3. Click **Deploy**. Use the provided URL.

### Important Note on Dependencies
The application uses CDNs for **Tailwind CSS**, **Lucide Icons**, and **SheetJS**. To use the application **offline** or in a restricted network, you would need to download these libraries and link them locally in `index.html`.
