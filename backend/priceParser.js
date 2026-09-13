"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePrice = parsePrice;
exports.extractPricesFromText = extractPricesFromText;
exports.findMostLikelyPrice = findMostLikelyPrice;
// Currency symbols and their codes
var currencyMap = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    '₹': 'INR',
    'Fr.': 'CHF',
    'CHF': 'CHF',
    'CAD': 'CAD',
    'AUD': 'AUD',
    'USD': 'USD',
    'EUR': 'EUR',
    'GBP': 'GBP',
    'A$': 'AUD',
    'C$': 'CAD',
    'HK$': 'HKD',
    'NZ$': 'NZD',
    'S$': 'SGD',
    'Rs.': 'INR',
    'Rs': 'INR',
    'AED': 'AED',
    'SAR': 'SAR',
    'KWD': 'KWD',
    'QAR': 'QAR',
    'BHD': 'BHD',
    'OMR': 'OMR',
    'Rp': 'IDR',
    'RM': 'MYR',
    'THB': 'THB',
    'PHP': 'PHP',
    'VND': 'VND',
    'R$': 'BRL',
    'kr': 'SEK',
    'kr.': 'SEK',
};
// Patterns to match prices in text
var pricePatterns = [
    // C$ 29.99 or Rs. 29.99 or $ 29.99
    /(?<currency>[$€£¥₹]|Fr\.|A\$|C\$|HK\$|NZ\$|S\$|Rs\.?|R\$|kr\.?|Rp|RM)\s*(?<price>[\d,]+\.?\d*)/i,
    // 29.99 USD or 29,99 EUR or 29.99 AED (Any 3 uppercase letters)
    /(?<price>[\d,]+\.?\d*)\s*(?<currency>[A-Z]{3})/i,
    // AED 29.99 (Any 3 uppercase letters before price)
    /(?<currency>[A-Z]{3})\s*(?<price>[\d,]+\.?\d*)/i,
    // Plain number with optional decimal (fallback)
    /(?<price>\d{1,3}(?:[,.\s]?\d{3})*(?:[.,]\d{2})?)/,
];
function parsePrice(text, defaultCurrency) {
    if (defaultCurrency === void 0) { defaultCurrency = 'USD'; }
    if (!text)
        return null;
    // Clean up the text
    var cleanText = text.trim().replace(/\s+/g, ' ');
    // Reject monthly payment/financing prices (e.g., "$25/mo", "per month", "4 payments", etc.)
    var lowerText = cleanText.toLowerCase();
    if (lowerText.includes('/mo') ||
        lowerText.includes('per month') ||
        lowerText.includes('monthly payment') ||
        lowerText.includes('a month') ||
        lowerText.includes('payments starting') ||
        lowerText.includes('payment of') ||
        lowerText.includes('payments of') ||
        /\d+\s*payments?\b/.test(lowerText) ||
        /\d+\s*mo\b/.test(lowerText)) {
        return null;
    }
    for (var _i = 0, pricePatterns_1 = pricePatterns; _i < pricePatterns_1.length; _i++) {
        var pattern = pricePatterns_1[_i];
        var match = cleanText.match(pattern);
        if (match && match.groups) {
            var priceStr = match.groups.price || match[1];
            var currencySymbol = (match.groups.currency || '').toUpperCase();
            if (priceStr) {
                var price = normalizePrice(priceStr);
                if (price !== null && price > 0) {
                    // If it matches a 3-letter code not in the map, use it directly (e.g., 'CAD', 'AED')
                    var is3LetterCode = /^[A-Z]{3}$/.test(currencySymbol);
                    var currency = currencyMap[currencySymbol] || currencyMap[match.groups.currency];
                    if (!currency && is3LetterCode) {
                        currency = currencySymbol;
                    }
                    return { price: price, currency: currency || defaultCurrency };
                }
            }
        }
    }
    // Try to extract just a number as fallback
    var numberMatch = cleanText.match(/[\d,]+\.?\d*/);
    if (numberMatch) {
        var price = normalizePrice(numberMatch[0]);
        if (price !== null && price > 0) {
            return { price: price, currency: defaultCurrency };
        }
    }
    return null;
}
function normalizePrice(priceStr) {
    if (!priceStr)
        return null;
    // Remove spaces
    var normalized = priceStr.replace(/\s/g, '');
    // Handle European format (1.234,56) vs US format (1,234.56)
    var hasCommaDecimal = /,\d{2}$/.test(normalized);
    var hasDotDecimal = /\.\d{2}$/.test(normalized);
    if (hasCommaDecimal && !hasDotDecimal) {
        // European format: 1.234,56 -> 1234.56
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    }
    else {
        // US format or plain number: remove commas
        normalized = normalized.replace(/,/g, '');
    }
    var price = parseFloat(normalized);
    return isNaN(price) ? null : Math.round(price * 100) / 100;
}
function extractPricesFromText(html) {
    var prices = [];
    var seen = new Set();
    // Match all price-like patterns in the HTML
    var allMatches = html.matchAll(/(?:[$€£¥₹])\s*[\d,]+\.?\d*|(?:CHF|Fr\.)\s*[\d,]+\.?\d*|[\d,]+\.?\d*\s*(?:USD|EUR|GBP|CAD|AUD|CHF)/gi);
    for (var _i = 0, allMatches_1 = allMatches; _i < allMatches_1.length; _i++) {
        var match = allMatches_1[_i];
        var parsed = parsePrice(match[0]);
        if (parsed && !seen.has(parsed.price)) {
            seen.add(parsed.price);
            prices.push(parsed);
        }
    }
    return prices;
}
function findMostLikelyPrice(prices) {
    if (prices.length === 0)
        return null;
    if (prices.length === 1)
        return prices[0];
    // Filter out very small prices (likely coupons, savings amounts, not actual product prices)
    // Most real products cost at least $2-3, and coupon amounts are often $1-5
    var validPrices = prices.filter(function (p) { return p.price >= 5; });
    // If no prices above $5, try with a lower threshold but above typical coupon amounts
    if (validPrices.length === 0) {
        var lowThresholdPrices = prices.filter(function (p) { return p.price >= 2; });
        if (lowThresholdPrices.length > 0) {
            lowThresholdPrices.sort(function (a, b) { return a.price - b.price; });
            return lowThresholdPrices[0];
        }
        // Fall back to original list if nothing matches
        return prices[0];
    }
    // Sort by price - the lowest valid price is often the sale/current price
    validPrices.sort(function (a, b) { return a.price - b.price; });
    return validPrices[0];
}
