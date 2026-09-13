const fs = require('fs');
const html = fs.readFileSync('amazon.html', 'utf8');
const cheerio = require('cheerio');
const $ = cheerio.load(html);

function parsePrice(text, defaultCurrency = 'USD') {
  if (!text) return null;
  const cleanText = text.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  const pattern = /(?<price>\d{1,3}(?:[,.\s]?\d{3})*(?:[.,]\d{2})?)/;
  const match = cleanText.match(pattern);
  if (match && match.groups && match.groups.price) {
    const priceStr = match.groups.price;
    let cleanStr = priceStr.replace(/[^0-9.,-]/g, '').trim();
    let normalized = cleanStr;
    const hasCommaDecimal = /,\d{2}$/.test(normalized);
    const hasDotDecimal = /\.\d{2}$/.test(normalized);
    if (hasCommaDecimal && !hasDotDecimal) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
    const price = parseFloat(normalized);
    return isNaN(price) ? null : { price: Math.round(price * 100) / 100, currency: defaultCurrency };
  }
  return null;
}

const priceSelectors = [
  '[class*="price"]',
  '[class*="Price"]',
  '[data-testid*="price"]',
  '[itemprop="price"]',
  '[data-price]',
  '.a-price-whole',
  '.a-offscreen',
];

const prices = [];
for (const selector of priceSelectors) {
  $(selector).each((_, el) => {
    const text = $(el).text().trim();
    const parsed = parsePrice(text);
    if (parsed && parsed.price > 0 && !prices.find(p => p.price === parsed.price)) {
      prices.push(parsed);
      console.log('Found:', text, '->', parsed.price);
    }
  });
}
console.log('Final candidates:', prices);
