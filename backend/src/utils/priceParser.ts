export interface ParsedPrice {
  price: number;
  currency: string;
}

// Currency symbols and their codes
const currencyMap: Record<string, string> = {
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
const pricePatterns = [
  // C$ 29.99 or Rs. 29.99 or $ 29.99
  /(?<currency>[$€£¥₹]|Fr\.|A\$|C\$|HK\$|NZ\$|S\$|Rs\.?|R\$|kr\.?|Rp|RM)\s*(?<price>[\d,]+\.?\d*)/i,
  // 29.99 USD or 29,99 EUR or 29.99 AED (Any 3 uppercase letters)
  /(?<price>[\d,]+\.?\d*)\s*(?<currency>[A-Z]{3})/i,
  // AED 29.99 (Any 3 uppercase letters before price)
  /(?<currency>[A-Z]{3})\s*(?<price>[\d,]+\.?\d*)/i,
  // Plain number with optional decimal (fallback)
  /(?<price>\d{1,3}(?:[,.\s]?\d{3})*(?:[.,]\d{2})?)/,
];

export function parsePrice(text: string, defaultCurrency: string = 'USD'): ParsedPrice | null {
  if (!text) return null;

  // Clean up the text
  const cleanText = text.trim().replace(/\s+/g, ' ');

  // Reject monthly payment/financing prices (e.g., "$25/mo", "per month", "4 payments", etc.)
  const lowerText = cleanText.toLowerCase();
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

  for (const pattern of pricePatterns) {
    const match = cleanText.match(pattern);
    if (match && match.groups) {
      const priceStr = match.groups.price || match[1];
      const currencySymbol = (match.groups.currency || '').toUpperCase();

      if (priceStr) {
        const price = normalizePrice(priceStr);
        if (price !== null && price > 0) {
          // If it matches a 3-letter code not in the map, use it directly (e.g., 'CAD', 'AED')
          const is3LetterCode = /^[A-Z]{3}$/.test(currencySymbol);
          let currency = currencyMap[currencySymbol] || currencyMap[match.groups.currency];
          
          if (!currency && is3LetterCode) {
            currency = currencySymbol;
          }
          
          return { price, currency: currency || defaultCurrency };
        }
      }
    }
  }

  // Try to extract just a number as fallback
  const numberMatch = cleanText.match(/[\d,]+\.?\d*/);
  if (numberMatch) {
    const price = normalizePrice(numberMatch[0]);
    if (price !== null && price > 0) {
      return { price, currency: defaultCurrency };
    }
  }

  return null;
}

function normalizePrice(priceStr: string): number | null {
  if (!priceStr) return null;

  // Remove spaces
  let normalized = priceStr.replace(/\s/g, '');

  // Handle European format (1.234,56) vs US format (1,234.56)
  const hasCommaDecimal = /,\d{2}$/.test(normalized);
  const hasDotDecimal = /\.\d{2}$/.test(normalized);

  if (hasCommaDecimal && !hasDotDecimal) {
    // European format: 1.234,56 -> 1234.56
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    // US format or plain number: remove commas
    normalized = normalized.replace(/,/g, '');
  }

  const price = parseFloat(normalized);
  return isNaN(price) ? null : Math.round(price * 100) / 100;
}

export function extractPricesFromText(html: string): ParsedPrice[] {
  const prices: ParsedPrice[] = [];
  const seen = new Set<number>();

  // Match all price-like patterns in the HTML
  const allMatches = html.matchAll(
    /(?:[$€£¥₹])\s*[\d,]+\.?\d*|(?:CHF|Fr\.)\s*[\d,]+\.?\d*|[\d,]+\.?\d*\s*(?:USD|EUR|GBP|CAD|AUD|CHF)/gi
  );

  for (const match of allMatches) {
    const parsed = parsePrice(match[0]);
    if (parsed && !seen.has(parsed.price)) {
      seen.add(parsed.price);
      prices.push(parsed);
    }
  }

  return prices;
}

export function findMostLikelyPrice(prices: ParsedPrice[]): ParsedPrice | null {
  if (prices.length === 0) return null;
  if (prices.length === 1) return prices[0];

  // Filter out very small prices (likely coupons, savings amounts, not actual product prices)
  // Most real products cost at least $2-3, and coupon amounts are often $1-5
  const validPrices = prices.filter((p) => p.price >= 5);

  // If no prices above $5, try with a lower threshold but above typical coupon amounts
  if (validPrices.length === 0) {
    const lowThresholdPrices = prices.filter((p) => p.price >= 2);
    if (lowThresholdPrices.length > 0) {
      lowThresholdPrices.sort((a, b) => a.price - b.price);
      return lowThresholdPrices[0];
    }
    // Fall back to original list if nothing matches
    return prices[0];
  }

  // Sort by price - the lowest valid price is often the sale/current price
  validPrices.sort((a, b) => a.price - b.price);

  return validPrices[0];
}
