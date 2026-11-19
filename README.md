# pour. — cocktail recipe website

Made by Kira Pugachova for the Interactive Web Technologies course.
Live site: https://kkearraa.github.io/pour/

## Files

| File | What it is |
|---|---|
| `index.html`, `cabinet.html`, `low-abv.html`, `minimalist.html`, `quiz.html` | Main pages |
| `about.html`, `contact.html`, `privacy.html` | Info pages |
| `404.html` | Shown by GitHub Pages when a page doesn't exist |
| `css/style.css` | **Readable** stylesheet (edit this one) |
| `css/style.min.css` | Minified copy that the pages actually load |
| `js/script.js` | **Readable** JavaScript (edit this one) |
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
3. Add the full-size width to `IMAGE_WIDTHS` in `js/script.js`, then rebuild `script.min.js`.
