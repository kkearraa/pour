# pour. — cocktail recipe website

Made by Kira Pugachova for the Interactive Web Technologies course.
Live site: https://kkearraa.github.io/pour/

**The recipes now live in a MySQL database** and visitors can add their own on the Community page.
To run the site: see **[DATABASE.md](DATABASE.md)** (short version: `cd server`, `npm install`,
copy `.env.example` to `.env`, `npm run db:setup`, `npm start`, open http://localhost:3000).

## Files

| File | What it is |
|---|---|
| `index.html`, `cabinet.html`, `low-abv.html`, `minimalist.html`, `quiz.html` | Main pages |
| `community.html` | Recipes shared by visitors + the "Share your recipe" form (logged-in users) |
| `account.html` | Log in / sign up, "My recipes" with Edit and Delete |
| `server/` | Node.js server: website files + recipe API (`server.js`, SQL in `recipes.js`, settings in `.env`) |
| `database/schema.sql`, `database/seed.sql` | Creates the MySQL tables / loads the starting recipes |
| `database/maintenance.sql`, `database/my.cnf.example` | Measuring (EXPLAIN, slow log), moderation queries, MySQL settings |
| `DATABASE.md` | How to set up, run, moderate and deploy the database version |
| `uploads/` | Photos uploaded by visitors (created automatically, not in Git) |
| `about.html`, `contact.html`, `privacy.html` | Info pages |
| `404.html` | Shown by GitHub Pages when a page doesn't exist |
| `css/style.css` | **Readable** stylesheet (edit this one) |
| `css/style.min.css` | Minified copy that the pages actually load |
| `js/script.js` | **Readable** JavaScript (edit this one). Loads recipes from the API, no data inside any more |
| `js/script.min.js` | Minified copy that the pages actually load |
| `images/*.webp` | Photos (800px) and their small versions (`*-400.webp`) |
| `images/logo/` | Logo files and favicons |
| `images/og-image.jpg` | Picture shown when the site is shared on social media |
| `sitemap.xml` | List of pages for Google Search Console / Bing |

## Important: after editing CSS or JavaScript

The pages load the **minified** files (`.min.css` / `.min.js`) because they are smaller and faster.
So after you change `style.css` or `script.js`, make new minified copies, otherwise your change won't show:

```
npx esbuild css/style.css --minify --outfile=css/style.min.css
npx esbuild js/script.js --minify --outfile=js/script.min.js
```

(Needs Node.js. Without it, you can paste the file into any online CSS/JS minifier and save the result
as the `.min` file.)

## Changing the contact email

In `contact.html`, find `data-user="your.name" data-domain="example.com"` and change the two parts
(before and after the @). The address is joined together by JavaScript so spam bots can't read it.

## Adding a photo

1. Save it as WebP, about 800px wide (for example with squoosh.app).
2. Also save a 400px-wide copy named `name-400.webp`.
3. Put both files in `images/` and set the recipe's `image_path` (e.g. `images/name.webp`) and
   `image_width` (the full-size width in pixels) in the `recipes` table. See DATABASE.md, section 5.
