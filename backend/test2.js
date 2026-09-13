const cheerio = require('cheerio'); const fs = require('fs'); const html = fs.readFileSync('amazon.html', 'utf8'); const $ = cheerio.load(html); const card = $('[data-asin=\
B0CTHF27FT\]'); console.log(card.attr('data-price')); console.log(card.text());
