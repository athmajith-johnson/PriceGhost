const fs = require('fs');
const cheerio = require('cheerio');
const html = fs.readFileSync('amazon.html', 'utf-8');
const $ = cheerio.load(html);
const priceElements = [];
const priceSelectors = ['.a-price-whole', '.a-offscreen'];
for (const selector of priceSelectors) {
  $(selector).each((_, el) => {
    const text = $(el).text().trim();
    if (text.match(/[\d,]+/)) priceElements.push(text);
  });
}
console.log(priceElements);
