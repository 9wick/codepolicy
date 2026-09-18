// PoC input: a missing business price is silently converted into a valid price.
export function calculateInvoiceTotal(unitPrice: number | undefined, quantity: number): number {
  return (unitPrice ?? 0) * quantity;
}
