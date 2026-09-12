export function formatPrice(price: number, currencyCode: string = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  } catch (error) {
    // Fallback if currency code is invalid
    return `${currencyCode} ${price.toFixed(2)}`;
  }
}
